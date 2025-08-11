use log::*;
use screeps::{RoomName, game};

use crate::{
    MEMORY,
    actor::{Actor, Context, actor, call, ret_do, ret_to},
    creeps::{Builder, Tender},
    rooms::spawner::Spawner,
};

pub struct Tend {
    room_name: RoomName,
    spawner: Actor<Spawner>,
}

impl Tend {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        room_name: RoomName,
        spawner: Actor<Spawner>,
    ) -> Option<Self> {
        call!([ctx], tend());
        Some(Self { room_name, spawner })
    }

    fn tend(&mut self, ctx: &mut Context<'_, Self>) {
        let room_name = self.room_name;
        let tender_name = MEMORY.with_borrow(|memory| {
            memory
                .rooms
                .get(&room_name)
                .map(|memory| memory.tender.clone())
        });
        let Some(room) = game::rooms().get(room_name) else {
            warn!("Room {room_name} not visible, not tending");
            return;
        };

        if let Some(name) = tender_name.clone()
            && game::creeps().get(name.clone()).is_some()
        {
            debug!("Tender from memory");
            let actor = ctx.actor();
            let ret = ret_do!(|_| call!([actor], tend()));
            actor!(ctx, Tender::init(name, room_name), ret);
        } else {
            debug!("New tender");
            let stored_energy = room
                .storage()
                .map(|s| {
                    s.store()
                        .get_used_capacity(Some(screeps::ResourceType::Energy))
                })
                .unwrap_or(0);
            let body = if stored_energy > 5000 {
                Tender::body(std::cmp::max(300, room.energy_available()))
            } else {
                warn!(
                    "Room {room_name} does not have enough energy stored, spawning emergency tender"
                );
                Builder::body(std::cmp::max(300, room.energy_available()))
            };
            let actor = ctx.actor();
            let tend_again = ret_do!(|_| call!([actor], tend()));
            let create_tender = ret_to!([ctx], |_, cx, name: String| {
                MEMORY.with_borrow_mut(|memory| {
                    memory.rooms.entry(room_name).or_default().tender = name.clone();
                });
                actor!(cx, Tender::init(name.clone(), room_name), tend_again);
            });
            call!(
                [self.spawner],
                queue(body, create_tender, Some("Tender".into()), true)
            )
        }
    }
}
