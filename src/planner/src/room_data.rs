use std::collections::HashMap;

use screeps::{LocalRoomTerrain, Position, RoomCoordinate, RoomName, RoomXY};

use crate::api;

pub struct RoomData {
    pub room_name: RoomName,
    pub shard: String,
    pub sources: Vec<Position>,
    pub controller: Option<Position>,
    pub terrain: HashMap<RoomName, LocalRoomTerrain>,
    pub mineral: Option<Position>,
    pub exits: Vec<RoomName>,
}

impl RoomData {
    pub fn from_api(shard: &str, name: &str) -> Result<RoomData, &'static str> {
        let Ok(room_name) = RoomName::new(name) else {
            return Err("Unable to parse room name");
        };

        let mut exits = vec![];
        let terrain = [(0, 0), (0, 1), (1, 0), (0, -1), (-1, 0)]
            .into_iter()
            .filter_map(|offset| {
                let name = room_name.checked_add(offset)?;
                if name != room_name {
                    exits.push(name);
                }
                let Ok(terrain) = api::get_room_terrain_data(shard, &name.to_string()) else {
                    return None;
                };
                Some((name, terrain))
            })
            .collect();

        let Ok(objects) = api::get_room_objects(shard, name) else {
            return Err("Unable to get room objects");
        };

        let mut sources = vec![];
        let mut controller = None;
        let mut mineral = None;

        objects
            .iter()
            .for_each(|object| match object.r#type.as_str() {
                "controller" => {
                    controller = Some(Position::new(
                        RoomCoordinate::new(object.x).unwrap(),
                        RoomCoordinate::new(object.y).unwrap(),
                        room_name,
                    ))
                }
                "source" => sources.push(Position::new(
                    RoomCoordinate::new(object.x).unwrap(),
                    RoomCoordinate::new(object.y).unwrap(),
                    room_name,
                )),
                "mineral" => {
                    mineral = Some(Position::new(
                        RoomCoordinate::new(object.x).unwrap(),
                        RoomCoordinate::new(object.y).unwrap(),
                        room_name,
                    ))
                }
                _ => {}
            });

        Ok(RoomData {
            room_name,
            shard: shard.into(),
            sources,
            controller,
            terrain,
            mineral,
            exits,
        })
    }
}
