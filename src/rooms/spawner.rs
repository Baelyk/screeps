use std::collections::VecDeque;

use log::*;
use screeps::{
    ObjectId, Room, RoomName, RoomVisual, StructureSpawn, action_error_codes::SpawnCreepErrorCode,
    constants::Part, find, game, prelude::*,
};

use crate::{
    actor::{Context, Ret, call, ret, stop, timer},
    visuals,
};

pub struct Spawner {
    room_name: RoomName,
    spawns: Vec<ObjectId<StructureSpawn>>,
    queue: VecDeque<(Vec<Part>, Ret<String>, Option<String>)>,
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
            && let Some((body, _, _)) = self.queue.front()
            && let Ok(name) = self.spawn_creep(spawn, body)
        {
            let (_, ret, _) = self.queue.pop_front().unwrap();
            ret!([ret], name);
        }

        call!([ctx], visualize());
        timer!([ctx], game::time() + 1, tick());
    }

    pub fn queue(
        &mut self,
        _ctx: &mut Context<'_, Self>,
        body: Vec<Part>,
        ret: Ret<String>,
        info: Option<String>,
        priority: bool,
    ) {
        debug!("Queueing {body:?} with priority {priority}");
        if priority {
            self.queue.push_front((body, ret, info));
        } else {
            self.queue.push_back((body, ret, info));
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

    fn visualize(&mut self, ctx: &mut Context<'_, Self>) {
        const Y: f32 = 10.0;
        let visual = RoomVisual::new(Some(self.room_name));
        let queue = self.queue.iter().map(|(_, _, info)| {
            "  ".to_owned()
                + if let Some(info) = info {
                    info
                } else {
                    "Unknown"
                }
        });
        visuals::text_lines(&visual, ["Spawn queue:".into()], 0.0, Y);
        visuals::text_lines(&visual, queue, 0.0, Y + 1.0);
    }
}
