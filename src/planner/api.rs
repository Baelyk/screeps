use screeps::{LocalRoomTerrain, Terrain, ROOM_AREA};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
struct EncodedTerrainData {
    //_id: String,
    //room: String,
    terrain: String,
    //r#type: String,
}

#[derive(Debug, Deserialize)]
struct EncodedTerrainResponse {
    //ok: usize,
    terrain: Vec<EncodedTerrainData>,
}

pub fn get_room_terrain_data(
    shard: &str,
    room: &str,
) -> Result<LocalRoomTerrain, Box<dyn std::error::Error>> {
    // Make request
    let url =
        format!("https://screeps.com/api/game/room-terrain?shard={shard}&room={room}&encoded=1");
    let resp = reqwest::blocking::get(url)?;
    let json = resp.json::<EncodedTerrainResponse>()?;

    let mut terrain = [0; ROOM_AREA];
    // Extract and convert terrain data
    json.terrain[0]
        .terrain
        .chars()
        .enumerate()
        .for_each(|(i, t)| {
            terrain[i] = match t {
                '0' => 0,
                '1' => 1,
                '2' => 2,
                _ => panic!("Unexpected value in terrain: {t}"),
            }
        });

    Ok(LocalRoomTerrain::new_from_bits(Box::new(terrain)))
}

#[derive(Debug, Deserialize)]
struct RoomObjectsResponse {
    //ok: usize,
    objects: Vec<RoomObjectData>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomObjectData {
    //_id: String,
    pub x: u8,
    pub y: u8,
    pub r#type: String,
    pub mineral_type: Option<String>,
}

pub fn get_room_objects(
    shard: &str,
    room: &str,
) -> Result<Vec<RoomObjectData>, Box<dyn std::error::Error>> {
    // Make request
    let url =
        format!("https://screeps.com/api/game/room-objects?shard={shard}&room={room}&encoded=1");
    let resp = reqwest::blocking::get(url)?;
    let json = resp.json::<RoomObjectsResponse>()?;

    // Extract room objects (includes sources, structures, creeps, etc.)
    Ok(json.objects)
}
