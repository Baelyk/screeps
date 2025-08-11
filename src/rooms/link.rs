use std::ops::Deref;

use log::{error, trace};
use screeps::{LINK_CAPACITY, Room, RoomName, RoomObject, StructureLink, find, game, prelude::*};

use crate::{actor::Context, call, stop, timer};

pub struct Link {
    room_name: RoomName,
}

#[derive(Default)]
struct Links {
    sources: Vec<(StructureLink, u32)>,
    sinks: Vec<(StructureLink, u32)>,
}

impl Link {
    pub fn init(ctx: &mut Context<'_, Self>, room_name: RoomName) -> Option<Self> {
        call!([ctx], tick());
        Some(Self { room_name })
    }

    fn find_link_in_range(s: impl Deref<Target = RoomObject>) -> Option<(StructureLink, u32)> {
        s.pos()
            .find_in_range(find::MY_STRUCTURES, 2)
            .into_iter()
            .find_map(|s| s.try_into().ok())
            .map(|link: StructureLink| {
                let energy = link
                    .store()
                    .get_used_capacity(Some(screeps::ResourceType::Energy));
                (link, energy)
            })
    }

    fn links(&self, room: &Room) -> Links {
        let sources = room
            .find(find::SOURCES, None)
            .into_iter()
            .filter_map(Self::find_link_in_range)
            .collect();
        let storage_link = room.storage().and_then(Self::find_link_in_range);
        let controller_link = room.controller().and_then(Self::find_link_in_range);
        let sinks = vec![controller_link, storage_link]
            .into_iter()
            .flatten()
            .collect();

        Links { sources, sinks }
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(room) = game::rooms().get(self.room_name) else {
            error!("Room {} not visible, stopping", self.room_name);
            stop!([ctx]);
            return;
        };

        let Links { sources, mut sinks } = self.links(&room);

        sources.iter().for_each(|(link, energy)| {
            if link.cooldown() == 0
                && *energy > LINK_CAPACITY / 2
                && let Some((target, target_energy)) =
                    sinks.iter_mut().find(|(_, energy)| *energy < LINK_CAPACITY)
            {
                let amount = std::cmp::min(LINK_CAPACITY - *target_energy, *energy);
                if amount > 1 {
                    match link.transfer_energy(target, Some(amount)) {
                        Ok(()) => {
                            trace!(
                                "Link at {} transfering {} energy to {}",
                                link.pos(),
                                amount,
                                target.pos(),
                            );
                            *target_energy += amount;
                        }
                        Err(err) => trace!(
                            "Link at {} failed to transfer {} energy to {}: {}",
                            link.pos(),
                            amount,
                            target.pos(),
                            err
                        ),
                    }
                }
            }
        });

        timer!([ctx], game::time() + 1, tick());
    }
}
