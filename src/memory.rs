use log::{debug, error};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Memory {
    pub test: String,
}

impl Default for Memory {
    fn default() -> Self {
        Self {
            test: "Hello, memory!".into(),
        }
    }
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
