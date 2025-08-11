use log::*;
use screeps::{Room, RoomName, constants::Part, find, game, prelude::*};

use crate::{
    MEMORY,
    actor::{Actor, Context, actor, call, ret, ret_to, stop, timer},
    creeps::{Builder, Tender, Upgrader},
    rooms::{construct::Construct, defend::Defend, mine::Mine, spawner::Spawner, tend::Tend},
};

pub mod construct;
mod defend;
mod mine;
mod spawner;
mod tend;

pub struct RoomActor {
    room_name: RoomName,
    spawner: Actor<Spawner>,
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

        let unemployment_room = room.clone();
        call!([ctx], unemployment(unemployment_room, construct));
        call!([ctx], tick());
        Some(Self { room_name, spawner })
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
        call!([self.spawner], queue(body, ret, false));
    }

    pub fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        timer!([ctx], game::time() + 1, tick())
    }
}
