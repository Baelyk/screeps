use log::warn;
use screeps::{RoomName, game};

use crate::{
    MEMORY,
    actor::{Actor, Context, actor, call, ret, ret_to, timer},
    creeps::{Builder, Upgrader},
    rooms::spawner::Spawner,
};

pub struct Upgrade {
    room_name: RoomName,
    spawner: Actor<Spawner>,
    upgraders: Vec<String>,
    has_queued_spawn: bool,
}

impl Upgrade {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) -> Option<Self> {
        call!([ctx], tick());
        Some(Self {
            room_name,
            spawner,
            upgraders: Default::default(),
            has_queued_spawn: false,
        })
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        call!([ctx], manage_upgraders());
        timer!([ctx], game::time() + 1, tick());
    }

    fn manage_upgraders(&mut self, ctx: &mut Context<'_, Self>) {
        // Initialize if upgraders is empty
        if self.upgraders.is_empty() {
            // Get living creeps from memory
            self.upgraders = MEMORY
                .with_borrow(|memory| {
                    memory
                        .rooms
                        .get(&self.room_name)
                        .map(|memory| memory.upgraders.clone())
                })
                .unwrap_or_default()
                .into_iter()
                .filter(|name| game::creeps().get(name.clone()).is_some())
                .collect();
            // Create actors
            self.upgraders.iter().for_each(|name| {
                let name = name.clone();
                actor!(ctx, Upgrader::init(name), ret!(None));
            });
        }

        // Remove dead upgraders
        self.upgraders = self
            .upgraders
            .iter()
            .filter(|name| game::creeps().get(name.to_string()).is_some())
            .cloned()
            .collect();

        // Update memory
        MEMORY.with_borrow_mut(|memory| {
            memory.rooms.entry(self.room_name).or_default().upgraders = self.upgraders.clone();
        });

        let Some(room) = game::rooms().get(self.room_name) else {
            warn!(
                "Room {} not visible, not spawning new upgraders",
                self.room_name
            );
            return;
        };

        // Between 1 and 5 upgraders, one per 20k energy in the storage
        let desired = room
            .storage()
            .map(|storage| {
                storage
                    .store()
                    .get_used_capacity(Some(screeps::ResourceType::Energy))
                    / 20_000
            })
            .unwrap_or_default()
            .clamp(1, 5) as usize;

        if !self.has_queued_spawn && self.upgraders.len() < desired {
            self.has_queued_spawn = true;
            let body = Builder::body(room.energy_capacity_available());
            let on_spawned = ret_to!([ctx], |this, ctx, name: String| {
                this.has_queued_spawn = false;
                this.upgraders.push(name.clone());
                actor!(ctx, Upgrader::init(name), ret!(None));
            });
            call!(
                [self.spawner],
                queue(body, on_spawned, Some("Upgrader".into()), false)
            );
        }
    }
}
