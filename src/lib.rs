#![feature(lazy_get)]

use std::cell::RefCell;

use log::*;
use screeps::{
    constants::Part, find, game, objects::Creep, prelude::*, Position, RoomName, StructureSpawn,
};
use wasm_bindgen::prelude::*;

use crate::{
    actor::{Actor, Context, Runtime},
    memory::Memory,
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
                    info!("spawning...");
                    let creep: Actor<CreepActor> = actor!(ctx, CreepActor::init(name));
                    call!([creep], say_hello());
                    call!([creep], upgrade());
                }
                Err(e) => warn!("couldn't spawn: {e:?}"),
            }
        } else {
            info!("not spawning");
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

    fn say_hello(&self, ctx: &mut Context<'_, Self>) {
        info!("Creep {} says hello!", self.creep_name);
        timer!([ctx], game::time() + 1, say_hello());
    }

    fn creep(&self) -> Creep {
        game::creeps().get(self.creep_name.clone()).unwrap()
    }

    fn move_to(&self, _ctx: &mut Context<'_, Self>, pos: Position) {
        info!("Creep {} moving to {}", self.creep_name, pos);
        if let Err(err) = self.creep().move_to(pos) {
            warn!("Creep move err {err}");
        }
    }

    fn upgrade(&self, ctx: &mut Context<'_, Self>) {
        info!("Creep {} upgrading", self.creep_name);
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
        info!("Creep {} harvesting", self.creep_name);
        let creep = self.creep();
        if creep.store().get_free_capacity(None) == 0 {
            call!([ctx], upgrade());
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
}

struct RoomActor {
    room_name: RoomName,
    spawns: Vec<Actor<Spawn>>,
}

impl RoomActor {
    fn init(_ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        Some(Self {
            room_name,
            spawns: vec![],
        })
    }

    fn get_spawns(&mut self, ctx: &mut Context<'_, Self>) {
        info!("Getting spawns in {}", self.room_name);
        self.spawns = game::spawns()
            .keys()
            .map(|spawn_name| actor!(ctx, Spawn::init(spawn_name)))
            .collect();
    }

    fn tick(&self, ctx: &mut Context<'_, Self>) {
        info!("Ticking for {}", self.room_name);
        if self.spawns.is_empty() {
            call!([ctx], get_spawns());
        }
        self.spawns
            .iter()
            .for_each(|spawn| call!([spawn], spawn_creep()));
        timer!([ctx], game::time() + 1, tick())
    }
}

#[wasm_bindgen(js_name = loop)]
pub fn game_loop() {
    INIT.call_once(|| {
        // Setup logging
        logging::setup_logging(logging::Info);

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
                call!([creep], upgrade());
            });
        }
    });

    logging::tick();
    RUNTIME.with_borrow_mut(|runtime| runtime.run(game::time()))
}
