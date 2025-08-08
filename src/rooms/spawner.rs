use std::collections::VecDeque;

use log::*;
use screeps::{
    ObjectId, Room, RoomName, StructureSpawn, action_error_codes::SpawnCreepErrorCode,
    constants::Part, find, game, prelude::*,
};

use crate::actor::{Context, Ret, call, ret, stop, timer};

pub struct Spawner {
    room_name: RoomName,
    spawns: Vec<ObjectId<StructureSpawn>>,
    queue: VecDeque<(Vec<Part>, Ret<String>)>,
}

impl Spawner {
    pub fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        call!([ctx], tick());
        Some(Self {
            room_name,
            spawns: vec![],
            queue: VecDeque::new(),
        })
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} invisible, stopping", self.room_name);
            stop!([ctx]);
            return;
        };

        if self.spawns.is_empty() || game::time().is_multiple_of(1000) {
            self.spawns = self.find_spawns(room);
        }

        if let Some(spawn) = self.next_spawn()
            && let Some((body, _)) = self.queue.front()
            && let Ok(name) = self.spawn_creep(spawn, body)
        {
            info!("Spawned {name}");
            let (_, ret) = self.queue.pop_front().unwrap();
            ret!([ret], name);
        }

        timer!([ctx], game::time() + 1, tick());
    }

    pub fn queue(
        &mut self,
        _ctx: &mut Context<'_, Self>,
        body: Vec<Part>,
        ret: Ret<String>,
        priority: bool,
    ) {
        debug!("Queueing {body:?} with priority {priority}");
        if priority {
            self.queue.push_front((body, ret));
        } else {
            self.queue.push_back((body, ret));
        }
    }

    fn next_spawn(&self) -> Option<StructureSpawn> {
        self.spawns
            .iter()
            .filter_map(|id| id.resolve())
            .find(|spawn| spawn.spawning().is_none())
    }

    fn spawn_creep(
        &self,
        spawn: StructureSpawn,
        body: &[Part],
    ) -> Result<String, SpawnCreepErrorCode> {
        debug!("Trying to spawn {body:?} at {}", spawn.pos());
        let name_base = game::time();
        let name = format!("{name_base}");
        spawn.spawn_creep(body, &name).map(|_| name)
    }

    fn find_spawns(&self, room: Room) -> Vec<ObjectId<StructureSpawn>> {
        room.find(find::MY_STRUCTURES, None)
            .into_iter()
            .filter_map(|s| TryInto::<StructureSpawn>::try_into(s).ok())
            .map(|s| s.id())
            .collect()
    }
}
