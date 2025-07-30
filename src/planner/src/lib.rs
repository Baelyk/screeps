use wasm_bindgen::prelude::*;

use crate::room_data::RoomData;

#[cfg(feature = "offline")]
pub mod api;

pub mod architect;
pub mod pathfinder;
pub mod room_data;

#[wasm_bindgen]
pub fn plan_room(room_name: &str) -> String {
    let room_data = RoomData::from_game(room_name).unwrap();
    let plan = architect::plan_room(&room_data).unwrap();
    serde_json::to_string(&plan).unwrap()
}
