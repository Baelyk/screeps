#![feature(lazy_get)]

use std::cell::RefCell;

use log::*;
use screeps::{StructureSpawn, constants::Part, game};
use wasm_bindgen::prelude::*;

use crate::{
    actor::{Context, Ret, Runtime},
    memory::Memory,
    rooms::RoomActor,
};

pub mod actor;
mod creeps;
mod logging;
mod memory;
pub mod planner;
mod rooms;

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
