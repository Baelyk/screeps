#![feature(lazy_get)]

use std::cell::RefCell;

use log::*;
use screeps::{
    constants::Part, find, game, objects::Creep, prelude::*, Position, Room, RoomName, RoomXY,
    StructureSpawn, StructureType,
};
use wasm_bindgen::prelude::*;

use crate::{
    actor::{Actor, Context, Runtime},
    memory::Memory,
    planner::{architect::RoomPlan, room_data::RoomData},
};

pub mod actor;
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

    fn spawn_creep(&self, ctx: &mut Context<'_, Self>) {
        let spawn = self.spawn();
        let body = [Part::Move, Part::Move, Part::Carry, Part::Work];
        if spawn.room().unwrap().energy_available() >= body.iter().map(|p| p.cost()).sum() {
            // create a unique name, spawn.
            let name_base = game::time();
            let name = format!("{name_base}");
            match spawn.spawn_creep(&body, &name) {
                Ok(()) => {
                    let creep: Actor<CreepActor> = actor!(ctx, CreepActor::init(name));
                    call!([creep], build());
                }
                Err(e) => warn!("couldn't spawn: {e:?}"),
            }
        }
    }
}

struct CreepActor {
    creep_name: String,
}

impl CreepActor {
    fn init(ctx: &mut Context<'_, Self>, creep_name: String) -> Option<Self> {
        if let Some(creep) = game::creeps().get(creep_name.clone()) {
            if !creep.spawning() {
                // Create exists and is not spawning, so we're ready
                info!("Creep {creep_name} ready");
                return Some(Self { creep_name });
            }
        }
        info!("Creep {creep_name} not ready");
        timer!([ctx], game::time() + 1, CreepActor::init(creep_name));
        None
    }

    fn creep(&self) -> Creep {
        game::creeps().get(self.creep_name.clone()).unwrap()
    }

    fn move_to(&self, _ctx: &mut Context<'_, Self>, pos: Position) {
        trace!("Creep {} moving to {}", self.creep_name, pos);
        if let Err(err) = self.creep().move_to(pos) {
            warn!("Creep move err {err}");
        }
    }

    fn upgrade(&self, ctx: &mut Context<'_, Self>) {
        trace!("Creep {} upgrading", self.creep_name);
        let creep = self.creep();
        if creep.store().get_used_capacity(None) == 0 {
            call!([ctx], harvest());
            return;
        }

        let room = creep.room().unwrap();
        let controller = room.controller().unwrap();
        if !creep.pos().is_near_to(controller.pos()) {
            call!([ctx], move_to(controller.pos()));
        } else {
            creep.upgrade_controller(&controller).unwrap();
        }
        timer!([ctx], game::time() + 1, upgrade());
    }

    fn harvest(&self, ctx: &mut Context<'_, Self>) {
        trace!("Creep {} harvesting", self.creep_name);
        let creep = self.creep();
        if creep.store().get_free_capacity(None) == 0 {
            call!([ctx], build());
            return;
        }

        let room = creep.room().unwrap();
        let source = room
            .find(find::SOURCES_ACTIVE, None)
            .first()
            .unwrap()
            .clone();
        if !creep.pos().is_near_to(source.pos()) {
            call!([ctx], move_to(source.pos()));
        } else {
            creep.harvest(&source).unwrap();
        }
        timer!([ctx], game::time() + 1, harvest());
    }

    fn build(&self, ctx: &mut Context<'_, Self>) {
        trace!("Creep {} building", self.creep_name);
        let creep = self.creep();
        if creep.store().get_used_capacity(None) == 0 {
            call!([ctx], harvest());
            return;
        }

        let room = creep.room().unwrap();
        let site = match room.find(find::CONSTRUCTION_SITES, None).first() {
            Some(site) => site.clone(),
            None => {
                call!([ctx], upgrade());
                return;
            }
        };
        if !creep.pos().is_near_to(site.pos()) {
            call!([ctx], move_to(site.pos()));
        } else {
            creep.build(&site).unwrap();
        }
        timer!([ctx], game::time() + 1, build());
    }
}

struct RoomActor {
    room_name: RoomName,
    spawns: Vec<Actor<Spawn>>,
    plan: Option<RoomPlan>,
}

impl RoomActor {
    fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        call!([ctx], get_spawns());
        call!([ctx], plan_room());
        Some(Self {
            room_name,
            spawns: vec![],
            plan: None,
        })
    }

    fn get_spawns(&mut self, ctx: &mut Context<'_, Self>) {
        debug!("Getting spawns in {}", self.room_name);
        self.spawns = game::spawns()
            .keys()
            .map(|spawn_name| actor!(ctx, Spawn::init(spawn_name)))
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
                            ty,
                            xy,
                            self.room_name,
                            err
                        );
                    }
                })
        }
    }

    fn tick(&self, ctx: &mut Context<'_, Self>) {
        self.spawns
            .iter()
            .for_each(|spawn| call!([spawn], spawn_creep()));
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
                let room_actor = actor!(runtime, RoomActor::init(room_name));
                call!([room_actor], tick())
            });
        }

        for creep_name in game::creeps().keys() {
            RUNTIME.with_borrow_mut(|runtime| {
                let creep = actor!(runtime, CreepActor::init(creep_name));
                call!([creep], build());
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
