use screeps::{game::map::get_room_terrain, RoomName, Terrain};
use wasm_bindgen::prelude::*;

pub mod api;
pub mod architect;
pub mod pathfinder;
pub mod room_data;

#[wasm_bindgen]
pub fn testing() -> Terrain {
    let terrain = get_room_terrain(RoomName::new("W51N13").expect("Failed to get room"));
    if let Some(terrain) = terrain {
        return terrain.get(5, 5);
    }
    return Terrain::Swamp;
}
