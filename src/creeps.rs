use crate::{
    RoomActor,
    actor::{Actor, Context, Runtime},
    call,
    memory::Memory,
    planner::{architect::RoomPlan, room_data::RoomData},
    ret_to, timer,
};
use log::*;
use screeps::{
    ConstructionSite, ObjectId, Position, Room, RoomName, RoomXY, Source, StructureObject,
    StructureSpawn, StructureType, constants::Part, find, game, objects::Creep, prelude::*,
};

pub struct Builder {
    owner: Actor<RoomActor>,
    name: String,
    site: Option<ConstructionSite>,
}

impl Builder {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        name: String,
        owner: Actor<RoomActor>,
    ) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone()) {
            if !creep.spawning() {
                // Create exists and is not spawning, so we're ready
                info!("Creep {name} ready");
                call!([ctx], build());
                return Some(Self {
                    name,
                    owner,
                    site: None,
                });
            }
        }
        info!("Creep {name} not ready");
        timer!([ctx], game::time() + 1, Self::init(name, owner));
        None
    }

    pub fn assign_site(&mut self, ctx: &mut Context<'_, Self>, site: Option<ConstructionSite>) {
        self.site = site;
        match self.site {
            Some(_) => call!([ctx], build()),
            None => call!([ctx], upgrade()),
        }
    }

    fn creep(&self) -> Creep {
        game::creeps().get(self.name.clone()).unwrap()
    }

    fn move_to(&self, _ctx: &mut Context<'_, Self>, pos: Position) {
        if let Err(err) = self.creep().move_to(pos) {
            warn!("Creep move err {err}");
        }
    }

    fn upgrade(&self, ctx: &mut Context<'_, Self>) {
        let creep = self.creep();
        if creep.store().get_used_capacity(None) == 0 {
            call!([ctx], get_energy());
            return;
        }

        let room = creep.room().unwrap();
        let controller = room.controller().unwrap();
        if !creep.pos().is_near_to(controller.pos()) {
            call!([ctx], move_to(controller.pos()));
        } else {
            creep.upgrade_controller(&controller).unwrap();
        }
        timer!([ctx], game::time() + 1, upgrade());
    }

    fn get_energy(&self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name.clone()) else {
            warn!("Creep {} missing", self.name);
            return;
        };
        if creep.store().get_free_capacity(None) == 0 {
            call!([ctx], build());
            return;
        }

        let room = creep.room().unwrap();
        let targets = room.find(find::STRUCTURES, None);
        let mut targets: Vec<StructureObject> = targets
            .into_iter()
            .filter(|s| {
                (s.structure_type() == StructureType::Container
                    || s.structure_type() == StructureType::Storage)
                    && s.as_has_store()
                        .map(|target| {
                            target
                                .store()
                                .get_used_capacity(Some(screeps::ResourceType::Energy))
                                > 0
                        })
                        .unwrap_or(false)
            })
            .collect();
        targets.sort_by_key(|s| s.pos().get_range_to(creep.pos()));
        if let Some(target) = targets.first() {
            let pos = target.pos();
            if creep.pos().is_near_to(pos) {
                if let Err(err) = creep.withdraw(
                    target.as_withdrawable().unwrap(),
                    screeps::ResourceType::Energy,
                    None,
                ) {
                    warn!("Creep {} target {} withdraw err: {}", self.name, pos, err);
                }
            } else {
                call!([ctx], move_to(pos));
            }
        } else {
            let source = room
                .find(find::SOURCES_ACTIVE, None)
                .first()
                .unwrap()
                .clone();
            if !creep.pos().is_near_to(source.pos()) {
                call!([ctx], move_to(source.pos()));
            } else {
                creep.harvest(&source).unwrap();
            }
        }
        timer!([ctx], game::time() + 1, get_energy());
    }

    fn build(&self, ctx: &mut Context<'_, Self>) {
        let creep = self.creep();
        if creep.store().get_used_capacity(None) == 0 {
            call!([ctx], get_energy());
            return;
        }

        let Some(site) = &self.site else {
            let ret = ret_to!([ctx], assign_site());
            call!([self.owner], assign_site(ret));
            return;
        };

        if !creep.pos().is_near_to(site.pos()) {
            let pos = site.pos();
            call!([ctx], move_to(pos));
        } else {
            creep.build(site).unwrap();
        }
        timer!([ctx], game::time() + 1, build());
    }
}

pub struct Miner {
    name: String,
    spot: Position,
    source: ObjectId<Source>,
}

impl Miner {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        name: String,
        spot: Position,
        source: ObjectId<Source>,
    ) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone()) {
            if !creep.spawning() {
                // Create exists and is not spawning, so we're ready
                info!("Creep {name} ready");
                call!([ctx], mine());
                return Some(Self { name, spot, source });
            }
        }
        info!("Creep {name} not ready");
        timer!([ctx], game::time() + 1, Self::init(name, spot, source));
        None
    }

    fn move_to(&self, _ctx: &mut Context<'_, Self>, creep: Creep, pos: Position) {
        trace!("Creep {} moving to {}", self.name, pos);
        if let Err(err) = creep.move_to(pos) {
            warn!("Creep move err {err}");
        }
    }

    fn mine(&self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name.clone()) else {
            warn!("Creep {} missing", self.name);
            return;
        };

        if creep.pos() != self.spot {
            let pos = self.spot;
            call!([ctx], move_to(creep, pos));
            timer!([ctx], game::time() + 1, mine());
            return;
        }

        trace!("Creep {} mining", self.name);

        let Some(source) = self.source.resolve() else {
            warn!("Creep {}'s source {} missing", self.name, self.source);
            return;
        };

        if let Err(err) = creep.harvest(&source) {
            warn!("Creep {} harvested with {err}", self.name);
        }
        timer!([ctx], game::time() + 1, mine());
    }
}
