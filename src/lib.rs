#![feature(lazy_get)]

use std::cell::RefCell;

use log::*;
use screeps::game;
use wasm_bindgen::prelude::*;

use crate::{actor::Runtime, memory::Memory, rooms::RoomActor, scout::Scout};

pub mod actor;
mod creeps;
mod logging;
mod memory;
pub mod planner;
mod rooms;
mod scout;
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
        logging::setup_logging_helpers();

        warn!("- - - RESET - - -");

        RUNTIME.with_borrow_mut(|runtime| {
            let scout = actor!(runtime, Scout::init(), ret!(None));

            // Create a room actor for every room
            for room_name in game::rooms().keys() {
                call!([scout], push_queue(room_name));
                let room_scout = scout.actor();
                actor!(runtime, RoomActor::init(room_name, room_scout), ret!(None));
            }
        });
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

fn random(buf: &mut [u8]) -> Result<(), getrandom::Error> {
    buf.iter_mut()
        .for_each(|byte| *byte = (js_sys::Math::random() * 256.0) as u8);
    Ok(())
}

#[unsafe(no_mangle)]
unsafe extern "Rust" fn __getrandom_v03_custom(
    dest: *mut u8,
    len: usize,
) -> Result<(), getrandom::Error> {
    let buf = unsafe {
        // fill the buffer with zeros
        core::ptr::write_bytes(dest, 0, len);
        // create mutable byte slice
        core::slice::from_raw_parts_mut(dest, len)
    };
    random(buf)
}
