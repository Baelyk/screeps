#![feature(lazy_get)]

use std::{cell::RefCell, collections::VecDeque};

use log::*;
use screeps::{
    ConstructionSite, ObjectId, Position, Room, RoomName, Source, StructureSpawn, StructureType,
    constants::Part, find, game, prelude::*,
};
use wasm_bindgen::prelude::*;

use crate::{
    actor::{Actor, Context, Ret, Runtime},
    creeps::{Builder, Miner},
    memory::Memory,
    planner::{architect::RoomPlan, room_data::RoomData},
};

pub mod actor;
mod creeps;
mod logging;
mod memory;
pub mod planner;

// this is one way to persist data between ticks within Rust's memory, as opposed to
// keeping state in memory on game objects - but will be lost on global resets!
thread_local! {
    static MEMORY: RefCell<Memory> = RefCell::new(Memory::load());
    static RUNTIME: RefCell<Runtime> = RefCell::default();
}

static INIT: std::sync::Once = std::sync::Once::new();

struct Spawn {
    spawn_name: String,
}

impl Spawn {
    fn init(_ctx: &mut Context<'_, Self>, spawn_name: String) -> Option<Self> {
        Some(Self { spawn_name })
    }

    fn spawn(&self) -> StructureSpawn {
        game::spawns().get(self.spawn_name.clone()).unwrap()
    }

    fn spawn_creep(&self, _ctx: &mut Context<'_, Self>, body: &[Part], ret: Ret<Option<String>>) {
        let spawn = self.spawn();
        if spawn.room().unwrap().energy_available() >= body.iter().map(|p| p.cost()).sum() {
            // create a unique name, spawn.
            let name_base = game::time();
            let name = format!("{name_base}");
            match spawn.spawn_creep(body, &name) {
                Ok(_) => ret!([ret], Some(name)),
                Err(_) => ret!([ret], None),
            }
        }
    }
}

struct RoomActor {
    room_name: RoomName,
    spawns: Vec<Actor<Spawn>>,
    plan: Option<RoomPlan>,
    miners: Vec<(Position, ObjectId<Source>, Option<String>)>,
    spawn_queue: VecDeque<(Vec<Part>, Ret<String>)>,
}

impl RoomActor {
    fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not creating actor");
            return None;
        };

        room.find(find::MY_CREEPS, None).iter().for_each(|creep| {
            let actor = ctx.actor();
            let name = creep.name().clone();
            if creep.store().get_capacity(None) > 0 {
                actor!(ctx, Builder::init(name, actor), ret!(None));
            }
        });

        call!([ctx], get_spawns());
        call!([ctx], plan_room());
        call!([ctx], mine());
        Some(Self {
            room_name,
            spawns: vec![],
            plan: None,
            miners: vec![],
            spawn_queue: VecDeque::new(),
        })
    }

    fn mine(&mut self, ctx: &mut Context<'_, Self>) {
        debug!("mining...");
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not mining", self.room_name);
            return;
        };
        debug!("mining still...");

        if self.miners.is_empty() {
            if let Some(miners) = MEMORY.with_borrow(|memory| {
                memory
                    .rooms
                    .get(&self.room_name)
                    .map(|memory| memory.miners.clone())
            }) && !miners.is_empty()
            {
                self.miners = miners;
            } else {
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
                call!(
                    [ctx],
                    queue_spawn(vec![Part::Move, Part::Work, Part::Work], ret)
                );
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

    fn assign_site(&mut self, ctx: &mut Context<'_, Self>, ret: Ret<Option<ConstructionSite>>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not assigning site", self.room_name);
            ret!([ret], None);
            return;
        };
        let site = room.find(find::CONSTRUCTION_SITES, None).first().cloned();
        ret!([ret], site);
    }

    fn spawned_miner(
        &mut self,
        ctx: &mut Context<'_, Self>,
        spot: Position,
        source: ObjectId<Source>,
        name: String,
    ) {
        self.miners
            .iter_mut()
            .find(|(miners_spot, _, _)| *miners_spot == spot)
            .unwrap()
            .2 = Some(name.clone());
        let spawn_ret = ret_to!([ctx], spawned_miner(spot, source));
        let actor = ctx.actor();
        let death_ret = ret_do!(|_| call!(
            [actor],
            queue_spawn(vec![Part::Move, Part::Work, Part::Work], spawn_ret)
        ));
        actor!(ctx, Miner::init(name, spot, source), death_ret);
    }

    fn builder_spawned(&mut self, ctx: &mut Context<'_, Self>, name: String) {
        let actor = ctx.actor();
        actor!(ctx, Builder::init(name, actor), ret!(None));
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

    fn tick(&self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not ticking", self.room_name);
            return;
        };

        debug!("miners: {:?}", self.miners);

        if !self.spawn_queue.is_empty() {
            call!([ctx], spawn());
        }

        let sites = room.find(find::CONSTRUCTION_SITES, None);
        if game::time().is_multiple_of(10) && !sites.is_empty() && self.spawn_queue.is_empty() {
            // Spawn a builder
            let body = vec![Part::Move, Part::Move, Part::Work, Part::Carry];
            let ret = ret_to!([ctx], builder_spawned());
            call!([ctx], queue_spawn(body, ret));
        }

        if game::time().is_multiple_of(100) {
            call!([ctx], build());
        }
        timer!([ctx], game::time() + 1, tick())
    }
}

#[wasm_bindgen(js_name = loop)]
pub fn game_loop() {
    let cpu = game::cpu::get_used();
    INIT.call_once(|| {
        // Setup logging
        logging::setup_logging(logging::Trace);

        warn!("- - - RESET - - -");

        // Create a room actor for every room
        for room_name in game::rooms().keys() {
            //let room = RoomActor::new(room_name);
            RUNTIME.with_borrow_mut(|runtime| {
                let room_actor = actor!(runtime, RoomActor::init(room_name), ret!(None));
                call!([room_actor], tick())
            });
        }
    });

    logging::tick();
    RUNTIME.with_borrow_mut(|runtime| runtime.run(game::time()));
    if game::time().is_multiple_of(10) {
        MEMORY.with_borrow(|mem| mem.save());
    }

    let cpu_used = game::cpu::get_used() - cpu;
    if cpu_used > game::cpu::limit().into() {
        warn!("{cpu_used:.2} cpu");
    } else if cpu_used > 10.0 {
        info!("{cpu_used:.2} cpu");
    } else if cpu_used > 2.0 {
        debug!("{cpu_used:.2} cpu");
    } else {
        trace!("{cpu_used:.2} cpu");
    }
}
