use std::collections::HashMap;

use screeps::Terrain;
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

fn get_room_terrain_data(
    shard: &str,
    room: &str,
) -> Result<Vec<Terrain>, Box<dyn std::error::Error>> {
    // Make request
    let url =
        format!("https://screeps.com/api/game/room-terrain?shard={shard}&room={room}&encoded=1");
    let resp = reqwest::blocking::get(url)?;
    let json = resp.json::<EncodedTerrainResponse>()?;

    // Extract and convert terrain data
    Ok(json.terrain[0]
        .terrain
        .chars()
        .map(|val| match val {
            '0' => Terrain::Plain,
            '1' => Terrain::Wall,
            '2' => Terrain::Swamp,
            _ => panic!("Unexpected value in terrain: {}", val),
        })
        .collect())
}

#[derive(Debug, Deserialize)]
struct RoomObjectsResponse {
    //ok: usize,
    objects: Vec<RoomObjectData>,
}

#[derive(Debug, Deserialize)]
struct RoomObjectData {
    //_id: String,
    x: u8,
    y: u8,
    r#type: String,
    mineralType: Option<String>,
}

fn get_room_objects(
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

#[derive(Debug, Serialize)]
struct EncodedBlueprint {
    buildings: EncodedBlueprintBuildings,
    terrain: Option<EncodedBlueprintTerrain>,
    controller: Option<EncodedBlueprintXY>,
    sources: Option<Vec<EncodedBlueprintXY>>,
    mineral: Option<EncodedBlueprintMineral>,
}

type EncodedBlueprintBuildings = HashMap<String, Vec<EncodedBlueprintXY>>;

#[derive(Debug, Serialize)]
struct EncodedBlueprintTerrain {
    wall: Option<Vec<EncodedBlueprintXY>>,
    swamp: Option<Vec<EncodedBlueprintXY>>,
}

#[derive(Copy, Clone, Debug, Serialize)]
struct EncodedBlueprintXY {
    x: u8,
    y: u8,
}

#[derive(Debug, Serialize)]
struct EncodedBlueprintMineral {
    x: u8,
    y: u8,
    mineralType: String,
}

fn room_index_to_xy(index: usize) -> EncodedBlueprintXY {
    // return { x: Math.floor(index / 50), y: index % 50 };
    EncodedBlueprintXY {
        x: index.rem_euclid(50) as u8,
        y: index.div_euclid(50) as u8,
    }
}

fn get_link_for_room(shard: &str, room: &str) -> Result<String, Box<dyn std::error::Error>> {
    let terrain_data = get_room_terrain_data(shard, room)?;
    let objects = get_room_objects(shard, room)?;

    let mut wall = vec![];
    let mut swamp = vec![];
    terrain_data.iter().enumerate().for_each(|(i, t)| match t {
        Terrain::Wall => wall.push(room_index_to_xy(i)),
        Terrain::Swamp => swamp.push(room_index_to_xy(i)),
        _ => {}
    });
    let terrain = Some(EncodedBlueprintTerrain {
        wall: Some(wall),
        swamp: Some(swamp),
    });

    let mut buildings: EncodedBlueprintBuildings = HashMap::new();
    let mut controller = None;
    let mut sources = vec![];
    let mut mineral = None;
    objects
        .iter()
        .for_each(|object| match object.r#type.as_str() {
            "controller" => {
                controller = Some(EncodedBlueprintXY {
                    x: object.x,
                    y: object.y,
                })
            }
            "source" => sources.push(EncodedBlueprintXY {
                x: object.x,
                y: object.y,
            }),
            "mineral" => {
                mineral = Some(EncodedBlueprintMineral {
                    x: object.x,
                    y: object.y,
                    mineralType: object.mineralType.clone().unwrap(),
                })
            }
            "creep" => {}
            _ => {
                let coord = EncodedBlueprintXY {
                    x: object.x,
                    y: object.y,
                };

                buildings
                    .entry(object.r#type.clone())
                    .and_modify(|v| v.push(coord))
                    .or_insert(vec![coord]);
            }
        });

    let blueprint = EncodedBlueprint {
        buildings,
        terrain,
        controller,
        sources: Some(sources),
        mineral,
    };

    Ok(screepers_planner_link(&blueprint))
}

fn screepers_planner_link(blueprint: &EncodedBlueprint) -> String {
    let serialized = serde_json::to_string(blueprint).unwrap();
    let data = lz_str::compress_to_encoded_uri_component(&serialized);
    format!("https://screepers.github.io/screeps-tools/?share={data}#/building-planner")
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("{}", get_link_for_room("shard0", "W51N13")?);
    Ok(())
}
