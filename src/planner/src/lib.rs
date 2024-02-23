use screeps::{game::map::get_room_terrain, RoomName, Terrain};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn testing() -> Terrain {
    let terrain = get_room_terrain(RoomName::new("W51N13").expect("Failed to get room"));
    if let Some(terrain) = terrain {
        return terrain.get(5, 5);
    }
    return Terrain::Swamp;
}
