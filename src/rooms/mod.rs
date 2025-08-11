use std::{collections::VecDeque, str::FromStr};

use log::*;
use screeps::{
    Event, ObjectId, Room, RoomName, RoomVisual, Source, Structure, StructureType, constants::Part,
    find, game, prelude::*,
};

use crate::{
    MEMORY,
    actor::{Actor, Context, actor, call, ret, ret_to, stop, timer},
    creeps::{Builder, Tender, Upgrader},
    rooms::{
        construct::Construct, defend::Defend, link::Link, mine::Mine, spawner::Spawner, tend::Tend,
    },
    visuals,
};

pub mod construct;
mod defend;
mod link;
mod mine;
mod spawner;
mod tend;

pub struct RoomActor {
    room_name: RoomName,
    spawner: Actor<Spawner>,
    stats: RoomStats,
}

impl RoomActor {
    pub fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not creating actor");
            stop!([ctx]);
            return None;
        };

        let spawner = actor!(ctx, Spawner::init(room_name), ret!(None));

        let mine_spawner = spawner.clone();
        actor!(ctx, Mine::init(room_name, mine_spawner), ret!(None));

        let construct_spawner = spawner.clone();
        let construct = actor!(
            ctx,
            Construct::init(room_name, construct_spawner),
            ret!(None)
        );

        let tend_spawner = spawner.clone();
        actor!(ctx, Tend::init(room_name, tend_spawner), ret!(None));

        let defend_spawner = spawner.clone();
        actor!(ctx, Defend::init(room_name, defend_spawner), ret!(None));

        actor!(ctx, Link::init(room_name), ret!(None));

        let unemployment_room = room.clone();
        call!([ctx], unemployment(unemployment_room, construct));
        call!([ctx], tick());
        Some(Self {
            room_name,
            spawner,
            stats: Default::default(),
        })
    }

    fn unemployment(
        &mut self,
        ctx: &mut Context<'_, Self>,
        room: Room,
        construct: Actor<Construct>,
    ) {
        let tender_name = MEMORY
            .with_borrow(|memory| {
                memory
                    .rooms
                    .get(&self.room_name)
                    .map(|memory| memory.tender.clone())
            })
            .unwrap_or_default();
        // List of miner names from memory
        let miners: Vec<String> = MEMORY
            .with_borrow(|memory| {
                memory.rooms.get(&self.room_name).map(|memory| {
                    memory
                        .miners
                        .iter()
                        .cloned()
                        .filter_map(|(_, _, name)| name)
                        .collect()
                })
            })
            .unwrap_or_default();
        let mut upgrader_assigned = false;
        let room_name = self.room_name;
        room.find(find::MY_CREEPS, None).iter().for_each(|creep| {
            let name = creep.name().clone();
            let has_work_part = creep
                .body()
                .iter()
                .map(|part| part.part())
                .any(|part| part == Part::Work);
            if creep.name() == tender_name {
                // Tenders are not unemployed
            } else if miners.contains(&creep.name()) {
                // Miners are not unemployed
            } else if !has_work_part {
                // No work parts, extra tender
                actor!(ctx, Tender::init(name, room_name), ret!(None));
            } else if !upgrader_assigned {
                // One upgrader
                upgrader_assigned = true;
                let death_ret = ret_to!([ctx], |this, ctx, _| {
                    this.upgrade(ctx);
                });
                actor!(ctx, Upgrader::init(name), death_ret);
            } else {
                // Rest as builders
                let owner = construct.actor();
                actor!(ctx, Builder::init(name, owner), ret!(None));
            }
        });
        if !upgrader_assigned {
            call!([ctx], upgrade());
        }
    }

    fn upgrade(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            warn!("Room {} not visible, not creating actor", self.room_name);
            stop!([ctx]);
            return;
        };

        let death_ret = ret_to!([ctx], |this, ctx, _| {
            this.upgrade(ctx);
        });
        let ret = ret_to!([ctx], |_, ctx, name| {
            actor!(ctx, Upgrader::init(name), death_ret);
        });
        let body = Builder::body(room.energy_capacity_available());
        call!(
            [self.spawner],
            queue(body, ret, Some("Upgrader".into()), false)
        );
    }

    fn visualize(&mut self, ctx: &mut Context<'_, Self>) {
        let mut lines = vec![];
        lines.push(format!("Room {}", self.room_name));

        let visual = RoomVisual::new(Some(self.room_name));

        if let Some(room) = game::rooms().get(self.room_name) {
            if let Some(controller) = room.controller() {
                let progress = controller
                    .progress()
                    .and_then(|progress| {
                        controller
                            .progress_total()
                            .map(|total| progress as f32 / total as f32)
                    })
                    .unwrap_or_default();
                visuals::progress_bar(
                    &visual,
                    progress,
                    format!("Level {}", controller.level()),
                    0.0,
                    lines.len() as f32,
                );
                lines.push(String::new());
            }

            let spawn_energy =
                room.energy_available() as f32 / room.energy_capacity_available() as f32;
            visuals::progress_bar(
                &visual,
                spawn_energy,
                "Spawn energy".to_string(),
                0.0,
                lines.len() as f32,
            );
            lines.push(String::new());

            let ticks_so_far = (game::time() - self.stats.tick) as f32;
            self.stats.built.push_front(0);
            self.stats.repaired.push_front(0);
            self.stats.spawned.push_front(0);
            self.stats.upgraded.push_front(0);
            self.stats.harvested.push_front(0);
            room.get_event_log().into_iter().for_each(
                |Event {
                     event,
                     object_id: _,
                 }| match event {
                    screeps::EventType::Build(event) => self.stats.built[0] += event.amount,
                    screeps::EventType::Repair(event) => {
                        self.stats.repaired[0] += event.energy_spent
                    }
                    screeps::EventType::Transfer(event) => {
                        if let Some(target) = ObjectId::<Structure>::from_str(&event.target_id)
                            .ok()
                            .and_then(|id| id.try_resolve().ok())
                            .flatten()
                            && (target.structure_type() == StructureType::Spawn
                                || target.structure_type() == StructureType::Extension)
                        {
                            self.stats.spawned[0] += event.amount;
                        }
                    }
                    screeps::EventType::UpgradeController(event) => {
                        self.stats.upgraded[0] += event.amount
                    }
                    screeps::EventType::Harvest(event) => {
                        if ObjectId::<Source>::from_str(&event.target_id)
                            .ok()
                            .and_then(|id| id.try_resolve().ok())
                            .flatten()
                            .is_some()
                        {
                            self.stats.harvested[0] += event.amount;
                        }
                    }
                    _ => {}
                },
            );
            if self.stats.built.len() > STATS_HISTORY {
                self.stats.built.pop_back();
                self.stats.repaired.pop_back();
                self.stats.spawned.pop_back();
                self.stats.upgraded.pop_back();
                self.stats.harvested.pop_back();
            }

            // Totals
            let built = self.stats.built.iter().sum::<u32>() as f32;
            let repaired = self.stats.repaired.iter().sum::<u32>() as f32;
            let spawned = self.stats.spawned.iter().sum::<u32>() as f32;
            let upgraded = self.stats.upgraded.iter().sum::<u32>() as f32;
            let harvested = self.stats.harvested.iter().sum::<u32>() as f32;
            let used = built + repaired + spawned + upgraded;

            [
                ("Built", built),
                ("Repaired", repaired),
                ("Spawned", spawned),
                ("Upgraded", upgraded),
                ("Used", used),
                ("Harvested", harvested),
            ]
            .into_iter()
            .for_each(|(label, total)| {
                visuals::progress_bar(
                    &visual,
                    total
                        / if label == "Used" {
                            harvested
                        } else if label == "Harvested" {
                            10.0 * 2.0 * self.stats.harvested.len() as f32
                        } else {
                            used
                        },
                    format!("{label}: {}/t", (total / ticks_so_far).round()),
                    0.0,
                    lines.len() as f32,
                );
                lines.push(String::new());
            });

            if let Some(storage) = room.storage() {
                lines.push(format!(
                    "Energy: {}k",
                    storage
                        .store()
                        .get_used_capacity(Some(screeps::ResourceType::Energy))
                        / 1000
                ));
            }
        }

        visuals::text_lines(&visual, lines, 0.0, 0.0);
    }

    pub fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        call!([ctx], visualize());
        timer!([ctx], game::time() + 1, tick());
    }
}

const STATS_HISTORY: usize = 15000;
struct RoomStats {
    tick: u32,
    built: VecDeque<u32>,
    repaired: VecDeque<u32>,
    spawned: VecDeque<u32>,
    upgraded: VecDeque<u32>,
    harvested: VecDeque<u32>,
}

impl Default for RoomStats {
    fn default() -> Self {
        Self {
            tick: game::time(),
            built: Default::default(),
            repaired: Default::default(),
            spawned: Default::default(),
            upgraded: Default::default(),
            harvested: Default::default(),
        }
    }
}
