use screeps::{LocalRoomTerrain, RoomName, RoomXY};

use crate::api;

pub struct RoomData {
    pub sources: Vec<RoomXY>,
    pub controller: Option<RoomXY>,
    pub terrain: LocalRoomTerrain,
    pub mineral: Option<RoomXY>,
    // N, E, S, W
    pub neighbor_terrain: [Option<LocalRoomTerrain>; 4],
}

impl RoomData {
    pub fn from_api(shard: &str, name: &str) -> Result<RoomData, &'static str> {
        let Ok(terrain) = api::get_room_terrain_data(shard, name) else {
            return Err("Unable to get room terrain");
        };
        let Ok(objects) = api::get_room_objects(shard, name) else {
            return Err("Unable to get room objects");
        };

        let Ok(room_name) = RoomName::new(name) else {
            return Err("Unable to parse room name");
        };
        let neighbor_terrain = [(0, 1), (1, 0), (0, -1), (-1, 0)].map(|offset| {
            let neighbor_name = room_name.checked_add(offset)?;
            let Ok(neighbor_terrain) =
                api::get_room_terrain_data(shard, &neighbor_name.to_string())
            else {
                return None;
            };
            Some(neighbor_terrain)
        });

        let mut sources = vec![];
        let mut controller = None;
        let mut mineral = None;

        objects
            .iter()
            .for_each(|object| match object.r#type.as_str() {
                "controller" => controller = RoomXY::checked_new(object.x, object.y).ok(),
                "source" => sources.push(RoomXY::checked_new(object.x, object.y).unwrap()),
                "mineral" => mineral = RoomXY::checked_new(object.x, object.y).ok(),
                _ => {}
            });

        Ok(RoomData {
            sources,
            controller,
            terrain,
            mineral,
            neighbor_terrain,
        })
    }
}
