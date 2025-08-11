#![feature(lazy_get)]

use std::cell::RefCell;

use log::*;
use screeps::game;
use wasm_bindgen::prelude::*;

use crate::{actor::Runtime, memory::Memory, rooms::RoomActor};

pub mod actor;
mod creeps;
mod logging;
mod memory;
pub mod planner;
mod rooms;
mod visuals;

// this is one way to persist data between ticks within Rust's memory, as opposed to
// keeping state in memory on game objects - but will be lost on global resets!
thread_local! {
    static MEMORY: RefCell<Memory> = RefCell::new(Memory::load());
    static RUNTIME: RefCell<Runtime> = RefCell::default();
}

static INIT: std::sync::Once = std::sync::Once::new();

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
                actor!(runtime, RoomActor::init(room_name), ret!(None));
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
