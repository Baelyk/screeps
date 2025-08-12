use std::collections::HashMap;

use log::*;
use screeps::{ObjectId, Position, RoomName, Source, StructureType, find, game, prelude::*};

use crate::{
    MEMORY,
    actor::{Actor, Context, actor, call, ret_do, ret_to, stop},
    creeps::Miner,
    rooms::spawner::Spawner,
};

pub struct Mine {
    room_name: RoomName,
    spawner: Actor<Spawner>,
    miners: Vec<(Position, ObjectId<screeps::Source>, Option<String>)>,
    uninitialized: bool,
    has_queued_spawn: bool,
}

impl Mine {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) -> Option<Self> {
        if game::rooms().get(room_name).is_none() {
            warn!("Room {room_name} not visible, not creating actor");
            stop!([ctx]);
            return None;
        };

        call!([ctx], mine());
        Some(Self {
            room_name,
            spawner,
            miners: vec![],
            uninitialized: true,
            has_queued_spawn: false,
        })
    }

    fn mine(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, stopping mine", self.room_name);
            stop!([ctx]);
            return;
        };

        // Map of miner spot -> miner name from memory
        let miners: HashMap<Position, String> = MEMORY
            .with_borrow(|memory| {
                memory.rooms.get(&self.room_name).map(|memory| {
                    memory
                        .miners
                        .iter()
                        .cloned()
                        .filter_map(|(pos, _, name)| name.map(|name| (pos, name)))
                        .collect()
                })
            })
            .unwrap_or_default();

        debug!(
            "Running mine for {} with self.miners {:?} and memory {:?} and uninitialized {}",
            self.room_name,
            self.miners
                .iter()
                .filter_map(|(_, _, name)| name.clone())
                .collect::<Vec<String>>(),
            miners.values(),
            self.uninitialized
        );

        // Find source containers, and assign miners from memory
        self.miners = room
            .find(find::STRUCTURES, None)
            .into_iter()
            .filter_map(|s| {
                if s.structure_type() == StructureType::Container {
                    debug!("c: {}", s.pos());
                    let pos = s.pos();
                    if let Some(source) =
                        pos.find_in_range(find::SOURCES, 1).first().map(|s| s.id())
                    {
                        return Some((pos, source, miners.get(&pos).cloned()));
                    }
                }
                None
            })
            .collect();

        // Update memory
        MEMORY.with_borrow_mut(|memory| {
            memory.rooms.entry(self.room_name).or_default().miners = self.miners.clone();
        });

        self.miners.iter().for_each(|(spot, source, name)| {
            let spot = *spot;
            let source = *source;

            // If the creep does not exist, spawn a new miner. Otherwise, if initializing, create
            // an actor for the miner.
            if name
                .clone()
                .and_then(|name| game::creeps().get(name))
                .is_none()
                && !self.has_queued_spawn
            {
                // Spawn a new miner
                self.has_queued_spawn = true;
                debug!("Miner {name:?} does not exist, spawning new miner for {spot}");
                let ret = ret_to!([ctx], spawned_miner(spot, source));
                let body = Miner::body(room.energy_capacity_available());
                call!(
                    [self.spawner],
                    queue(body, ret, Some("Miner".into()), false)
                );
            } else if self.uninitialized
                && let Some(name) = name
            {
                // Create the miner actor
                debug!("Creating new miner actor for {name} at {spot}");
                let name = name.clone();
                call!([ctx], spawned_miner(spot, source, name));
            }
        });
        self.uninitialized = false;
    }

    fn spawned_miner(
        &mut self,
        ctx: &mut Context<'_, Self>,
        spot: Position,
        source: ObjectId<Source>,
        name: String,
    ) {
        // Update self.miners and memory
        self.has_queued_spawn = false;
        self.miners
            .iter_mut()
            .find(|(miners_spot, _, _)| *miners_spot == spot)
            .unwrap()
            .2 = Some(name.clone());
        MEMORY.with_borrow_mut(|memory| {
            memory.rooms.entry(self.room_name).or_default().miners = self.miners.clone();
        });

        let actor = ctx.actor();
        let death_ret = ret_do!(|_| call!([actor], mine()));
        actor!(ctx, Miner::init(name, spot, source), death_ret);
        // Call mine again in case another miner died while waiting to spawn this one
        call!([ctx], mine());
    }
}
