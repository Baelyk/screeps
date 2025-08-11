use log::{info, warn};
use screeps::{RoomName, StructureTower, game, prelude::*};

use crate::{
    actor::{Actor, Context, call, timer},
    rooms::spawner::Spawner,
};

pub struct Defend {
    room_name: RoomName,
    spawner: Actor<Spawner>,
}

impl Defend {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) -> Option<Self> {
        call!([ctx], tick());
        Some(Self { room_name, spawner })
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            timer!([ctx], game::time() + 1, tick());
            return;
        };

        let towers: Vec<StructureTower> = room
            .find(screeps::find::MY_STRUCTURES, None)
            .into_iter()
            .filter_map(|s| s.try_into().ok())
            .collect();

        let hostiles = room.find(screeps::find::HOSTILE_CREEPS, None);
        if let Some(target) = hostiles.first() {
            towers.iter().for_each(|tower| match tower.attack(target) {
                Ok(()) => info!(
                    "Tower {} attacking {} at {}",
                    tower.pos(),
                    target.name(),
                    target.pos()
                ),
                Err(err) => warn!(
                    "Tower {} failed to attack target {} at {} with {}",
                    tower.pos(),
                    target.name(),
                    target.pos(),
                    err
                ),
            });
        }

        timer!([ctx], game::time() + 1, tick());
    }
}
