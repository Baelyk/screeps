use std::collections::{HashMap, HashSet};

use log::{error, trace, warn};
use screeps::{
    MoveToOptions, OwnedStructure, Part, Position, ResourceType, RoomCoordinate, RoomName, RoomXY,
    StructureType, find, game, prelude::*,
};
use serde::{Deserialize, Serialize};

use crate::{
    MEMORY,
    actor::{Actor, Context},
    call, ret_to,
    rooms::spawner::Spawner,
    timer,
};

pub struct Scout {
    data: HashMap<RoomName, ScoutData>,
    scouts: HashMap<String, Option<RoomName>>,
    spawners: HashMap<RoomName, Actor<Spawner>>,
    queue: HashSet<RoomName>,
    has_queued_spawn: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ScoutingMemory {
    scouts: HashMap<String, Option<RoomName>>,
    queue: HashSet<RoomName>,
    data: HashMap<RoomName, ScoutData>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
enum ControllerStatus {
    Owned {
        owner: String,
        level: u8,
        progress: u32,
    },
    Reserved {
        owner: String,
        ticks: u32,
    },
    Unowned,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct ControllerData {
    xy: RoomXY,
    status: ControllerStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoutData {
    time: u32,
    sources: Vec<RoomXY>,
    mineral: Option<(RoomXY, ResourceType)>,
    controller: Option<ControllerData>,
    structures: HashMap<StructureType, Vec<RoomXY>>,
}

impl Scout {
    pub fn init(ctx: &mut Context<'_, Self>) -> Option<Self> {
        call!([ctx], tick());
        Some(Self {
            data: Default::default(),
            scouts: Default::default(),
            spawners: Default::default(),
            queue: Default::default(),
            has_queued_spawn: false,
        })
    }

    pub fn provide_spawner(
        &mut self,
        _ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) {
        self.spawners.insert(room_name, spawner);
    }

    pub fn push_queue(&mut self, _ctx: &mut Context<'_, Self>, room_name: RoomName) {
        self.queue.insert(room_name);
    }

    fn remember(&self, _ctx: &mut Context<'_, Self>) {
        let scouting_memory = ScoutingMemory {
            scouts: self.scouts.clone(),
            queue: self.queue.clone(),
            data: self.data.clone(),
        };

        MEMORY.with_borrow_mut(|memory| memory.scouting = scouting_memory);
    }

    fn add_scout(&mut self, _ctx: &mut Context<'_, Self>, name: String) {
        self.has_queued_spawn = false;
        self.scouts.insert(name, None);
    }

    fn scout(&mut self, ctx: &mut Context<'_, Self>, room_name: RoomName) {
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Unable to scout invisible room {room_name}");
            return;
        };

        trace!("Scouting {room_name}");

        let time = game::time();
        let sources = room
            .find(find::SOURCES, None)
            .into_iter()
            .map(|s| s.pos().xy())
            .collect();
        let mineral = room
            .find(find::MINERALS, None)
            .into_iter()
            .map(|m| (m.pos().xy(), m.mineral_type()))
            .next();
        let controller = room.controller().map(|c| {
            let xy = c.pos().xy();
            ControllerData {
                xy,
                status: if let Some(owner) = AsRef::<OwnedStructure>::as_ref(&c).owner() {
                    ControllerStatus::Owned {
                        owner: owner.username(),
                        level: c.level(),
                        progress: c.progress().unwrap_or_default(),
                    }
                } else if let Some(reservation) = c.reservation() {
                    ControllerStatus::Reserved {
                        owner: reservation.username(),
                        ticks: reservation.ticks_to_end(),
                    }
                } else {
                    ControllerStatus::Unowned
                },
            }
        });
        let mut structures: HashMap<StructureType, Vec<RoomXY>> = HashMap::new();
        room.find(find::STRUCTURES, None).into_iter().for_each(|s| {
            structures
                .entry(s.structure_type())
                .or_default()
                .push(s.pos().xy())
        });

        let data = ScoutData {
            time,
            sources,
            mineral,
            controller,
            structures,
        };
        self.data.insert(room_name, data);
        call!([ctx], remember());
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        // Initialize
        if self.scouts.is_empty() && self.queue.is_empty() {
            let memory = MEMORY.with_borrow(|memory| memory.scouting.clone());
            self.scouts = memory.scouts;
            self.queue = memory.queue;
        }

        // Find scouting targets
        const SCOUT_INTERVAL: u32 = 15_000;
        self.data.iter().for_each(|(room_name, data)| {
            if game::time() - data.time > SCOUT_INTERVAL {
                self.queue.insert(*room_name);
            }

            game::map::describe_exits(*room_name)
                .values()
                .filter(|exit| {
                    if let Some(data) = self.data.get(exit)
                        && data.time < SCOUT_INTERVAL
                    {
                        false
                    } else {
                        true
                    }
                })
                .for_each(|exit| {
                    self.queue.insert(exit);
                });
        });

        if self.queue.is_empty() {
            timer!([ctx], game::time() + 1, tick());
            return;
        }

        // Spawn a scout if there are queued rooms but no scouts
        if self.scouts.is_empty() && !self.has_queued_spawn {
            // TODO: select spawner based on proximity
            if let Some(spawner) = self.spawners.values().next() {
                self.has_queued_spawn = true;
                let ret = ret_to!([ctx], add_scout());
                call!(
                    [spawner],
                    queue(vec![Part::Move], ret, Some("Scout".into()), false)
                );
            } else {
                warn!("Scout has no spawners");
            }
        }

        // Move scouts
        self.scouts = self
            .scouts
            .iter()
            .filter_map(|(name, target)| {
                let Some(creep) = game::creeps().get(name.clone()) else {
                    target.map(|target| self.queue.insert(target));
                    return None;
                };
                let Some(current) = creep.room().map(|room| room.name()) else {
                    error!("Creep {name} has no room, cannot scout");
                    return None;
                };

                let target = target.or({
                    self.queue
                        .iter()
                        .min_by_key(|dest| {
                            game::map::get_room_linear_distance(current, **dest, false)
                        })
                        .copied()
                        .inspect(|dest| {
                            self.queue.remove(dest);
                        })
                });

                if let Some(target) = target {
                    if current == target {
                        call!([ctx], scout(target));
                        return Some((creep.name(), None));
                    } else {
                        let middle = Position::new(
                            RoomCoordinate::new(24).unwrap(),
                            RoomCoordinate::new(24).unwrap(),
                            target,
                        );
                        let result = creep
                            .move_to_with_options(middle, Some(MoveToOptions::new().range(22)));
                        trace!("Creep {name} moving to {middle} with {result:?}");
                    }
                }
                Some((creep.name(), target))
            })
            .collect();

        timer!([ctx], game::time() + 1, tick());
    }
}
