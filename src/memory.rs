use std::collections::HashMap;

use log::{debug, error};
use screeps::{ObjectId, Position, RoomName, Source};
use serde::{Deserialize, Serialize};

use crate::planner::architect::RoomPlan;

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Memory {
    pub rooms: HashMap<RoomName, RoomMemory>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct RoomMemory {
    pub plan: Option<RoomPlan>,
    pub miners: Vec<(Position, ObjectId<Source>, Option<String>)>,
    pub tender: String,
}

impl Memory {
    pub fn load() -> Self {
        debug!("Loading memory");
        let stringified = screeps::raw_memory::get().as_string().unwrap();

        serde_json::from_str(&stringified).unwrap_or_default()
    }

    pub fn save(&self) {
        debug!("Saving memory");
        match serde_json::to_string(self) {
            Ok(stringified) => screeps::raw_memory::set(&stringified.into()),
            Err(err) => error!("Unable to serialize memory: {err}"),
        }
    }
}
