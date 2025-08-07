use std::collections::VecDeque;

use log::*;
use screeps::{
    ObjectId, Position, Room, RoomName, Source, StructureObject, StructureType, constants::Part,
    find, game, prelude::*,
};

use crate::{
    MEMORY, Spawn,
    actor::{Actor, Context, Ret, actor, call, ret, ret_do, ret_to, timer},
    creeps::{Builder, BuilderTarget, Miner, Tender, Upgrader},
    planner::{self, architect::RoomPlan, room_data::RoomData},
    stop,
};

pub struct RoomActor {
    room_name: RoomName,
    spawns: Vec<Actor<Spawn>>,
    plan: Option<RoomPlan>,
    miners: Vec<(Position, ObjectId<screeps::Source>, Option<String>)>,
    spawn_queue: VecDeque<(Vec<Part>, Ret<String>)>,
    tender_name: Option<String>,
}

impl RoomActor {
    pub fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not creating actor");
            stop!([ctx]);
            return None;
        };

        let tender_name = MEMORY.with_borrow(|memory| {
            memory
                .rooms
                .get(&room_name)
                .map(|memory| memory.tender.clone())
        });

        // Tend
        // Upgrade
        // Mine
        // Build & repair

        call!([ctx], get_spawns());
        call!([ctx], plan_room());
        call!([ctx], mine());
        call!([ctx], tend());
        let room1 = room.clone();
        call!([ctx], unemployment(room1));
        Some(Self {
            room_name,
            spawns: vec![],
            plan: None,
            miners: vec![],
            spawn_queue: VecDeque::new(),
            tender_name,
        })
    }

    fn unemployment(&mut self, ctx: &mut Context<'_, Self>, room: Room) {
        let tender_name = MEMORY
            .with_borrow(|memory| {
                memory
                    .rooms
                    .get(&self.room_name)
                    .map(|memory| memory.tender.clone())
            })
            .unwrap_or_default();
        let miners: Vec<String> = self
            .miners
            .iter()
            .filter_map(|(_, _, name)| name.clone())
            .collect();
        let mut upgrader_assigned = false;
        let room_name = self.room_name;
        room.find(find::MY_CREEPS, None).iter().for_each(|creep| {
            let name = creep.name().clone();
            let has_work_part = creep
                .body()
                .iter()
                .map(|part| part.part())
                .any(|part| part == Part::Work);
            if creep.name() == tender_name {
                // Tenders are not unemployed
            } else if miners.contains(&creep.name()) {
                // Miners are not unemployed
            } else if !has_work_part {
                // No work parts, extra tender
                actor!(ctx, Tender::init(name, room_name), ret!(None));
            } else if !upgrader_assigned {
                // One upgrader
                upgrader_assigned = true;
                actor!(ctx, Upgrader::init(name), ret!(None));
            } else {
                // Rest as builders
                let owner = ctx.actor();
                actor!(ctx, Builder::init(name, owner), ret!(None));
            }
        });
        if !upgrader_assigned {
            call!([ctx], upgrade());
        }
    }

    fn upgrade(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not creating actor", self.room_name);
            stop!([ctx]);
            return;
        };

        let death_ret = ret_to!([ctx], |this, ctx, _| {
            this.upgrade(ctx);
        });
        let ret = ret_to!([ctx], |_, ctx, name| {
            actor!(ctx, Upgrader::init(name), death_ret);
        });
        let body = Builder::body(room.energy_capacity_available());
        call!([ctx], queue_spawn(body, ret));
    }

    fn tend(&mut self, ctx: &mut Context<'_, Self>) {
        let room_name = self.room_name;
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not tending");
            return;
        };

        if let Some(name) = self.tender_name.clone()
            && game::creeps().get(name.clone()).is_some()
        {
            debug!("Tender from memory");
            let actor = ctx.actor();
            let ret = ret_do!(|_| call!([actor], tend()));
            actor!(ctx, Tender::init(name, room_name), ret);
        } else {
            debug!("New tender");
            let stored_energy = room
                .storage()
                .map(|s| {
                    s.store()
                        .get_used_capacity(Some(screeps::ResourceType::Energy))
                })
                .unwrap_or(0);
            let body = if stored_energy > 5000 {
                Tender::body(std::cmp::max(300, room.energy_available()))
            } else {
                warn!(
                    "Room {room_name} does not have enough energy stored, spawning emergency tender"
                );
                Builder::body(std::cmp::max(300, room.energy_available()))
            };
            let actor = ctx.actor();
            let tend_again = ret_do!(|_| call!([actor], tend()));
            let create_tender = ret_to!([ctx], |_, cx, name: String| {
                MEMORY.with_borrow_mut(|memory| {
                    memory.rooms.entry(room_name).or_default().tender = name.clone();
                });
                actor!(cx, Tender::init(name.clone(), room_name), tend_again);
            });
            self.spawn_queue.push_front((body, create_tender));
        }
    }

    fn mine(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not mining", self.room_name);
            return;
        };

        if self.miners.is_empty() {
            if let Some(miners) = MEMORY.with_borrow(|memory| {
                memory
                    .rooms
                    .get(&self.room_name)
                    .map(|memory| memory.miners.clone())
            }) && !miners.is_empty()
            {
                debug!("Loaded miners from memory");
                self.miners = miners;
            } else {
                debug!("Building miners");
                self.miners = room
                    .find(find::STRUCTURES, None)
                    .into_iter()
                    .filter_map(|s| {
                        if s.structure_type() == StructureType::Container {
                            debug!("c: {}", s.pos());
                            if let Some(source) = s
                                .pos()
                                .find_in_range(find::SOURCES, 1)
                                .first()
                                .map(|s| s.id())
                            {
                                return Some((s.pos(), source, None));
                            }
                        }
                        None
                    })
                    .collect();

                MEMORY.with_borrow_mut(|memory| {
                    memory.rooms.entry(self.room_name).or_default().miners = self.miners.clone();
                });
            }
        }

        self.miners.iter().for_each(|(spot, source, name)| {
            let spot = *spot;
            let source = *source;

            // Validate the existence of the creep
            let Some(creep) = name.clone().and_then(|name| game::creeps().get(name)) else {
                // Spawn a new miner
                let ret = ret_to!([ctx], spawned_miner(spot, source));
                let body = Miner::body(room.energy_capacity_available());
                call!([ctx], queue_spawn(body, ret));
                return;
            };

            // Create the miner actor
            let name = creep.name();
            call!([ctx], spawned_miner(spot, source, name));
        });
    }

    fn queue_spawn(&mut self, _ctx: &mut Context<'_, Self>, body: Vec<Part>, ret: Ret<String>) {
        self.spawn_queue.push_back((body, ret));
    }

    fn get_spawns(&mut self, ctx: &mut Context<'_, Self>) {
        debug!("Getting spawns in {}", self.room_name);
        self.spawns = game::spawns()
            .keys()
            .map(|spawn_name| actor!(ctx, Spawn::init(spawn_name), ret!(None)))
            .collect();
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
            .and_then(|room_data| planner::architect::plan_room(&room_data));
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

    fn build(&mut self, _ctx: &mut Context<'_, Self>) {
        let Some(plan) = &self.plan else {
            warn!("Room {} lacks a plan, not building", self.room_name);
            return;
        };
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not building", self.room_name);
            return;
        };
        let Some(controller) = room.controller() else {
            warn!("Room {} lacks controller, not building", self.room_name);
            return;
        };
        let level = controller.level();

        info!("Building room {}", self.room_name);

        self.create_plan_sites(plan, &room, level, StructureType::Container);
        self.create_plan_sites(plan, &room, level, StructureType::Road);
        self.create_plan_sites(plan, &room, level, StructureType::Spawn);
        self.create_plan_sites(plan, &room, level, StructureType::Extension);
        self.create_plan_sites(plan, &room, level, StructureType::Tower);
        self.create_plan_sites(plan, &room, level, StructureType::Storage);
        self.create_plan_sites(plan, &room, level, StructureType::Link);
    }

    fn create_plan_sites(&self, plan: &RoomPlan, room: &Room, level: u8, ty: StructureType) {
        if let Some(xys) = plan.get(&ty) {
            xys.iter()
                .enumerate()
                .take_while(|&(i, _)| i < ty.controller_structures(level.into()) as usize)
                .for_each(|(_, &xy)| {
                    if let Err(err) =
                        room.create_construction_site(xy.x.into(), xy.y.into(), ty, None)
                    {
                        trace!(
                            "Error building {} site at {} in {}: {}",
                            ty, xy, self.room_name, err
                        );
                    }
                })
        }
    }

    pub fn assign_site(&mut self, _ctx: &mut Context<'_, Self>, ret: Ret<BuilderTarget>) {
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

        let lowest = &repairables[0];
        if lowest.as_structure().hits() < lowest.as_structure().hits() / 4 {
            ret!([ret], BuilderTarget::Repair(lowest.as_structure().id()));
            return;
        }

        if let Some(site) = room
            .find(find::CONSTRUCTION_SITES, None)
            .into_iter()
            .find_map(|s| s.try_id())
        {
            ret!([ret], BuilderTarget::Build(site));
            return;
        }

        ret!([ret], BuilderTarget::None);
    }

    fn spawned_miner(
        &mut self,
        ctx: &mut Context<'_, Self>,
        spot: Position,
        source: ObjectId<Source>,
        name: String,
    ) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!(
                "Room {} not visible when trying to spawn miner",
                self.room_name
            );
            return;
        };

        self.miners
            .iter_mut()
            .find(|(miners_spot, _, _)| *miners_spot == spot)
            .unwrap()
            .2 = Some(name.clone());
        let spawn_ret = ret_to!([ctx], spawned_miner(spot, source));
        let actor = ctx.actor();
        let body = Miner::body(room.energy_capacity_available());
        let death_ret = ret_do!(|_| call!([actor], queue_spawn(body, spawn_ret)));
        actor!(ctx, Miner::init(name, spot, source), death_ret);
    }

    fn spawn(&mut self, ctx: &mut Context<'_, Self>) {
        let Some((body, _)) = self.spawn_queue.front() else {
            return;
        };

        let body = body.clone();
        let ret = ret_to!([ctx], spawned());

        trace!("Spawning {body:?}...?");

        call!([self.spawns[0]], spawn_creep(&body, ret));
    }

    fn spawned(&mut self, _ctx: &mut Context<'_, Self>, name: Option<String>) {
        let Some(name) = name else {
            return;
        };

        let Some((_, ret)) = self.spawn_queue.pop_front() else {
            error!("Spawn queue unexpectedly empty");
            return;
        };

        ret!([ret], name);
    }

    pub fn tick(&self, ctx: &mut Context<'_, Self>) {
        let room_name = self.room_name;
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not ticking");
            return;
        };

        if !self.spawn_queue.is_empty() {
            call!([ctx], spawn());
        }

        let sites = room.find(find::CONSTRUCTION_SITES, None);
        // TODO: something better than only spawning builders when there's five or fewer creeps
        let population = game::creeps().entries().count();
        if game::time().is_multiple_of(10)
            && !sites.is_empty()
            && self.spawn_queue.is_empty()
            && population <= 5
        {
            // Spawn a builder
            let body = Builder::body(room.energy_capacity_available());
            let owner = ctx.actor();
            let ret = ret_to!([ctx], |_, ctx, name| {
                actor!(ctx, Builder::init(name, owner), ret!(None));
            });
            call!([ctx], queue_spawn(body, ret));
        }

        if game::time().is_multiple_of(100) {
            call!([ctx], build());
        }
        timer!([ctx], game::time() + 1, tick())
    }
}
