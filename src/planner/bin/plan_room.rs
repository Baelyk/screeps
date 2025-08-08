use serde::Serialize;
use std::collections::HashMap;

use baelyks_screeps::planner::{architect::plan_room, room_data::RoomData};
use screeps::{
    MOVE_COST_PLAIN, Position, ROOM_AREA, ROOM_USIZE, RoomCoordinate, RoomName, RoomXY,
    StructureType, Terrain, XMajor,
};

fn main() -> Result<(), &'static str> {
    let shard = "shard3";
    let name = "W5S2";
    let room = RoomData::from_api(shard, name)?;

    let buildings = plan_room(&room)?;
    let blueprint = EncodedBlueprint {
        name: Some(name.into()),
        shard: Some(shard.into()),
        buildings,
        controller: None,
        sources: None,
        terrain: None,
        mineral: None,
    };
    let link = screepers_planner_link(&blueprint);
    println!("{link}");
    Ok(())
}

#[derive(Debug, Serialize)]
struct EncodedBlueprintTerrain {
    wall: Option<Vec<RoomXY>>,
    swamp: Option<Vec<RoomXY>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EncodedBlueprintMineral {
    x: u8,
    y: u8,
    mineral_type: String,
}

#[derive(Debug, Serialize)]
struct EncodedBlueprint {
    name: Option<String>,
    shard: Option<String>,
    buildings: HashMap<StructureType, Vec<RoomXY>>,
    terrain: Option<EncodedBlueprintTerrain>,
    controller: Option<RoomXY>,
    sources: Option<Vec<RoomXY>>,
    mineral: Option<EncodedBlueprintMineral>,
}

fn screepers_planner_link(blueprint: &EncodedBlueprint) -> String {
    let serialized = serde_json::to_string(blueprint).unwrap();
    let data = lz_str::compress_to_encoded_uri_component(&serialized);
    format!("https://screepers.github.io/screeps-tools/?share={data}#/building-planner")
}
