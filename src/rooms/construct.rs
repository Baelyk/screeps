use log::*;
use screeps::{Room, RoomName, StructureObject, StructureType, find, game, prelude::*};

use crate::{
    MEMORY,
    actor::{Actor, Context, Ret, actor, call, ret, ret_to, timer},
    creeps::{Builder, BuilderTarget},
    planner::{
        architect::{self},
        room_data::RoomData,
    },
    rooms::spawner::Spawner,
};

enum Builders {
    Intialized(Vec<String>),
    Unitialized,
}

pub struct Construct {
    room_name: RoomName,
    plan: Option<architect::RoomPlan>,
    builders: Builders,
    spawner: Actor<Spawner>,
    has_queued_spawn: bool,
}

impl Construct {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) -> Option<Self> {
        call!([ctx], tick());
        Some(Self {
            room_name,
            plan: None,
            builders: Builders::Unitialized,
            spawner,
            has_queued_spawn: false,
        })
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        if self.plan.is_none() {
            call!([ctx], plan_room());
        }

        if game::time().is_multiple_of(100)
            && let Some(plan) = &self.plan
            && let Some(room) = game::rooms().get(self.room_name)
            && let Some(level) = room.controller().map(|c| c.level())
        {
            self.build(plan, room, level);
        }

        call!([ctx], manage_builders());

        timer!([ctx], game::time() + 1, tick());
    }

    fn manage_builders(&mut self, ctx: &mut Context<'_, Self>) {
        let names = MEMORY
            .with_borrow(|memory| {
                memory
                    .rooms
                    .get(&self.room_name)
                    .map(|memory| memory.builders.clone())
            })
            .unwrap_or_default();

        match &self.builders {
            Builders::Unitialized => {
                let living: Vec<String> = names
                    .into_iter()
                    .filter(|name| game::creeps().get(name.clone()).is_some())
                    .collect();
                living.iter().for_each(|name| {
                    let name = name.clone();
                    let owner = ctx.actor();
                    actor!(ctx, Builder::init(name, owner), ret!(None));
                });
                self.builders = Builders::Intialized(living);
            }
            Builders::Intialized(builders) => {
                let living: Vec<String> = builders
                    .iter()
                    .filter(|&name| game::creeps().get(name.clone()).is_some())
                    .cloned()
                    .collect();
                if living.len() < 2
                    && let Some(room) = game::rooms().get(self.room_name)
                {
                    let has_sites = !room.find(find::CONSTRUCTION_SITES, None).is_empty();
                    let has_urgent_repairs = room
                        .find(find::STRUCTURES, None)
                        .into_iter()
                        .filter(|s| s.as_structure().hits_max() > 0)
                        .any(|s| s.as_structure().hits() < s.as_structure().hits_max() / 4);
                    if has_sites || has_urgent_repairs {
                        // Spawn a builder
                        call!([ctx], spawn());
                    }
                }
                self.builders = Builders::Intialized(living);
            }
        }
    }

    fn spawn(&mut self, ctx: &mut Context<'_, Self>) {
        if !self.has_queued_spawn
            && let Some(room) = game::rooms().get(self.room_name)
        {
            self.has_queued_spawn = true;
            let body = Builder::body(room.energy_capacity_available());
            let ret = ret_to!([ctx], spawned_builder());
            call!(
                [self.spawner],
                queue(body, ret, Some("Builder".into()), false)
            );
        }
    }

    fn spawned_builder(&mut self, ctx: &mut Context<'_, Self>, name: String) {
        let Builders::Intialized(builders) = &mut self.builders else {
            warn!(
                "Spawned builder in room {} but builders is uninitialized",
                self.room_name
            );
            return;
        };
        self.has_queued_spawn = false;
        builders.push(name.clone());
        let owner = ctx.actor();
        actor!(ctx, Builder::init(name, owner), ret!(None));
    }

    pub fn assign_target(&mut self, _ctx: &mut Context<'_, Self>, ret: Ret<BuilderTarget>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not assigning site", self.room_name);
            ret!([ret], BuilderTarget::None);
            return;
        };

        let repairables = room.find(find::STRUCTURES, None);
        let mut repairables: Vec<StructureObject> = repairables
            .into_iter()
            .filter(|s| s.as_structure().hits_max() > 0)
            .collect();
        repairables.sort_by_key(|s| s.as_structure().hits() * 100 / s.as_structure().hits_max());

        if let Some(lowest) = repairables.first()
            && lowest.as_structure().hits() < lowest.as_structure().hits_max() / 4
        {
            ret!([ret], BuilderTarget::Repair(lowest.as_structure().id()));
        } else if let Some(site) = room
            .find(find::CONSTRUCTION_SITES, None)
            .into_iter()
            .find_map(|s| s.try_id())
        {
            ret!([ret], BuilderTarget::Build(site));
        } else if let Some(lowest) = repairables.first()
            && lowest.as_structure().hits() < 3 * lowest.as_structure().hits_max() / 4
        {
            ret!([ret], BuilderTarget::Repair(lowest.as_structure().id()));
        } else {
            ret!([ret], BuilderTarget::None);
        }
    }

    fn plan_room(&mut self, _ctx: &mut Context<'_, Self>) {
        if let Some(plan_from_memory) = MEMORY.with_borrow(|memory| {
            memory
                .rooms
                .get(&self.room_name)
                .and_then(|memory| memory.plan.clone())
        }) {
            debug!("Loaded plan for room {} from memory", self.room_name);
            self.plan = Some(plan_from_memory);
            return;
        }

        info!("Planning room {}...", self.room_name);
        let plan = RoomData::from_game(self.room_name)
            .and_then(|room_data| architect::plan_room(&room_data));
        match plan {
            Ok(plan) => {
                info!("Plan successful, saving plan");
                self.plan = Some(plan.clone());
                MEMORY.with_borrow_mut(|memory| {
                    memory.rooms.entry(self.room_name).or_default().plan = Some(plan);
                });
            }
            Err(err) => warn!("Error planning room {}: {}", self.room_name, err),
        }
    }

    fn build(&self, plan: &architect::RoomPlan, room: Room, level: u8) {
        info!("Building room {}", self.room_name);

        let mut site_count = room.find(find::CONSTRUCTION_SITES, None).len();
        site_count =
            self.create_plan_sites(plan, &room, level, StructureType::Container, site_count);
        site_count = self.create_plan_sites(plan, &room, level, StructureType::Road, site_count);
        site_count = self.create_plan_sites(plan, &room, level, StructureType::Spawn, site_count);
        site_count =
            self.create_plan_sites(plan, &room, level, StructureType::Extension, site_count);
        site_count = self.create_plan_sites(plan, &room, level, StructureType::Tower, site_count);
        site_count = self.create_plan_sites(plan, &room, level, StructureType::Storage, site_count);
        self.create_plan_sites(plan, &room, level, StructureType::Link, site_count);
    }

    fn create_plan_sites(
        &self,
        plan: &architect::RoomPlan,
        room: &Room,
        level: u8,
        ty: StructureType,
        site_count: usize,
    ) -> usize {
        let mut site_count = site_count;
        if let Some(xys) = plan.get(&ty) {
            xys.iter()
                .enumerate()
                .take_while(|&(i, _)| i < ty.controller_structures(level.into()) as usize)
                .for_each(|(_, &xy)| {
                    if site_count < 100 {
                        match room.create_construction_site(xy.x.into(), xy.y.into(), ty, None) {
                            Ok(_) => site_count += 1,
                            Err(err) => {
                                trace!(
                                    "Error building {} site at {} in {}: {}",
                                    ty, xy, self.room_name, err
                                );
                            }
                        }
                    }
                })
        };

        site_count
    }
}
