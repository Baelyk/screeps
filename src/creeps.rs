use crate::{
    actor::{Actor, Context},
    call, ret_to,
    rooms::construct::Construct,
    stop, timer,
};
use log::*;
use screeps::{
    ConstructionSite, CostMatrix, LINK_CAPACITY, ObjectId, Position, ROOM_AREA, ROOM_USIZE,
    RawObjectId, Resource, ResourceType, RoomName, Source, Structure, StructureContainer,
    StructureLink, StructureObject, StructureStorage, StructureType, TransferableObject,
    action_error_codes::{HarvestErrorCode, WithdrawErrorCode},
    constants::Part,
    find, game, look,
    objects::Creep as CreepObject,
    pathfinder::SingleRoomCostResult,
    prelude::*,
};

#[derive(Copy, Clone, Debug)]
struct GetEnergyOptions {
    prioritize_storage: bool,
    allow_storage: bool,
}

impl Default for GetEnergyOptions {
    fn default() -> Self {
        Self {
            prioritize_storage: false,
            allow_storage: true,
        }
    }
}

enum GetEnergyTarget {
    Structure(StructureObject),
    Resource(Resource),
}

impl GetEnergyTarget {
    fn pos(&self) -> Position {
        match self {
            GetEnergyTarget::Structure(s) => s.pos(),
            GetEnergyTarget::Resource(r) => r.pos(),
        }
    }

    fn energy(&self) -> u32 {
        match self {
            GetEnergyTarget::Structure(s) => s
                .as_has_store()
                .map(|s| s.store().get_used_capacity(Some(ResourceType::Energy)))
                .unwrap_or_default(),
            GetEnergyTarget::Resource(r) => r.amount(),
        }
    }
}

trait Creep
where
    Self: Sized,
{
    /// The creep's in-game name
    fn name(&self) -> &String;

    fn move_to(&self, creep: CreepObject, pos: Position) {
        let result = creep.move_to(pos);
        trace!("Creep {} moving to {} with {:?}", self.name(), pos, result)
    }

    fn get_energy(&self, creep: CreepObject, options: GetEnergyOptions) {
        let room = creep.room().unwrap();
        if options.prioritize_storage
            && let Some(storage) = room.storage()
            && storage
                .store()
                .get_used_capacity(Some(ResourceType::Energy))
                > 0
        {
            self.get_energy_from_storage(creep, &storage);
            return;
        }

        let mut targets: Vec<GetEnergyTarget> = room
            .find(find::DROPPED_RESOURCES, None)
            .into_iter()
            .filter(|r| r.resource_type() == ResourceType::Energy)
            .map(GetEnergyTarget::Resource)
            .chain(
                room.find(find::STRUCTURES, None)
                    .into_iter()
                    .filter(|s| {
                        (s.structure_type() == StructureType::Container
                            || s.structure_type() == StructureType::Link
                            || (options.allow_storage
                                && s.structure_type() == StructureType::Storage))
                            && s.as_has_store()
                                .map(|target| {
                                    target
                                        .store()
                                        .get_used_capacity(Some(screeps::ResourceType::Energy))
                                        > 0
                                })
                                .unwrap_or(false)
                    })
                    .map(GetEnergyTarget::Structure),
            )
            .collect();
        targets.sort_by_cached_key(|s| {
            match creep.pos().find_path_to::<Position, Box<dyn FnMut(RoomName, CostMatrix) -> SingleRoomCostResult>, SingleRoomCostResult>(&s.pos(), None) {
                screeps::Path::Vectorized(path) => path.len(),
                screeps::Path::Serialized(_) => ROOM_AREA,
            }
        });

        if let Some(target) = targets.first() {
            let pos = target.pos();
            if creep.pos().is_near_to(pos) {
                match target {
                    GetEnergyTarget::Structure(s) => {
                        if let Some(target) = s.as_withdrawable() {
                            match creep.withdraw(target, ResourceType::Energy, None) {
                                Ok(()) => {
                                    trace!("Creep {} getting energy from {}", self.name(), pos)
                                }
                                Err(err) => trace!(
                                    "Creep {} failed to get energy from {}: {}",
                                    self.name(),
                                    pos,
                                    err
                                ),
                            }
                        } else {
                            error!(
                                "Creep {} tried to get energy from non-withdrawable target at {}",
                                self.name(),
                                pos
                            );
                        }
                    }
                    GetEnergyTarget::Resource(r) => match creep.pickup(r) {
                        Ok(()) => trace!("Creep {} picking up energy from {}", self.name(), pos),
                        Err(err) => trace!(
                            "Creep {} failed to pick up energy from {}: {}",
                            self.name(),
                            pos,
                            err
                        ),
                    },
                }
            } else {
                trace!("Creep {} moving to {} to get energy", self.name(), pos);
                self.move_to(creep, pos);
            }
        } else if let Some(source) = room.find(find::SOURCES_ACTIVE, None).first() {
            if creep.pos().is_near_to(source.pos()) {
                match creep.harvest(source) {
                    Ok(()) => trace!(
                        "Creep {} harvesting from source {}",
                        self.name(),
                        source.pos()
                    ),
                    Err(err) => trace!(
                        "Creep {} failed to harvest from source {}: {}",
                        self.name(),
                        source.pos(),
                        err
                    ),
                }
            } else {
                self.move_to(creep, source.pos());
            }
        }
    }

    fn get_energy_from_storage(&self, creep: CreepObject, storage: &StructureStorage) {
        if creep.withdraw(storage, ResourceType::Energy, None) == Err(WithdrawErrorCode::NotInRange)
        {
            self.move_to(creep, storage.pos())
        }
    }

    fn upgrade(&self, creep: CreepObject) {
        let room = creep.room().unwrap();
        let controller = room.controller().unwrap();
        if !creep.pos().in_range_to(controller.pos(), 3) {
            self.move_to(creep, controller.pos());
        } else {
            creep.upgrade_controller(&controller).unwrap();
        }
    }
}

enum CreepState {
    GetEnergy,
    Work,
}

#[derive(Copy, Clone)]
pub enum BuilderTarget {
    Build(ObjectId<ConstructionSite>),
    Repair(ObjectId<Structure>),
    None,
}

pub struct Builder {
    owner: Actor<Construct>,
    name: String,
    target: BuilderTarget,
    state: CreepState,
}

impl Creep for Builder {
    fn name(&self) -> &String {
        &self.name
    }
}

impl Builder {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        name: String,
        owner: Actor<Construct>,
    ) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone())
            && !creep.spawning()
        {
            // Create exists and is not spawning, so we're ready
            info!("Creep {name} ready");
            call!([ctx], tick());
            return Some(Self {
                name,
                owner,
                target: BuilderTarget::None,
                state: CreepState::Work,
            });
        }
        info!("Creep {name} not ready");
        timer!([ctx], game::time() + 1, Self::init(name, owner));
        None
    }

    pub fn body(energy: u32) -> Vec<Part> {
        let segments = (energy / (Part::Move.cost() + Part::Work.cost() + Part::Carry.cost()))
            .clamp(1, 50 / 3);

        (0..segments * 3)
            .map(|i| {
                if i < segments {
                    Part::Move
                } else if i < 2 * segments {
                    Part::Work
                } else {
                    Part::Carry
                }
            })
            .collect()
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name().clone()) else {
            info!("Creep {} died, stopping", self.name());
            stop!([ctx]);
            return;
        };

        match self.state {
            CreepState::Work => {
                if creep
                    .store()
                    .get_used_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    match self.target {
                        BuilderTarget::Repair(target) => self.repair(creep, target),
                        BuilderTarget::Build(target) => self.build(creep, target),
                        BuilderTarget::None => {
                            let ret = ret_to!([ctx], assign_site(creep));
                            call!([self.owner], assign_target(ret));
                        }
                    }
                } else {
                    self.state = CreepState::GetEnergy;
                    call!([ctx], tick());
                    return;
                }
            }
            CreepState::GetEnergy => {
                if creep
                    .store()
                    .get_free_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    self.get_energy(creep, Default::default());
                } else {
                    self.state = CreepState::Work;
                    call!([ctx], tick());
                    return;
                }
            }
        }

        timer!([ctx], game::time() + 1, tick())
    }

    pub fn assign_site(
        &mut self,
        _ctx: &mut Context<'_, Self>,
        creep: CreepObject,
        target: BuilderTarget,
    ) {
        self.target = target;
        match self.target {
            BuilderTarget::Build(target) => self.build(creep, target),
            BuilderTarget::Repair(target) => self.repair(creep, target),
            BuilderTarget::None => self.upgrade(creep),
        }
    }

    fn build(&mut self, creep: CreepObject, target: ObjectId<ConstructionSite>) {
        let Some(target) = target.resolve() else {
            warn!("Creep {}'s target {} no longer valid", self.name, target);
            self.target = BuilderTarget::None;
            return;
        };
        let pos = target.pos();

        trace!("Builder {} building {}", self.name, pos);

        if !creep.pos().is_near_to(pos) {
            self.move_to(creep, pos);
        } else if let Err(err) = creep.build(&target) {
            warn!("Builder {} failed to build {}: {}", self.name, pos, err);
        }
    }

    fn repair(&mut self, creep: CreepObject, target: ObjectId<Structure>) {
        let Some(target): Option<StructureObject> = target.resolve().map(|s| s.into()) else {
            warn!("Creep {}'s target {} no longer valid", self.name, target);
            self.target = BuilderTarget::None;
            return;
        };

        if target.as_structure().hits() == target.as_structure().hits_max() {
            trace!(
                "Creep {}'s target {} fully repaired",
                self.name,
                target.pos()
            );
            self.target = BuilderTarget::None;
            return;
        }

        let pos = target.pos();
        let Some(target) = target.as_repairable() else {
            warn!(
                "Builder {} assigned nonrepairable target at {}",
                self.name,
                target.pos()
            );
            self.target = BuilderTarget::None;
            return;
        };

        trace!("Builder {} repairing {}", self.name, pos);

        if !creep.pos().is_near_to(pos) {
            self.move_to(creep, pos);
        } else {
            creep.repair(target).unwrap();
        }
    }
}

pub struct Miner {
    name: String,
    spot: Position,
    source: ObjectId<Source>,
}

impl Creep for Miner {
    fn name(&self) -> &String {
        &self.name
    }
}

impl Miner {
    pub fn init(
        ctx: &mut Context<'_, Self>,
        name: String,
        spot: Position,
        source: ObjectId<Source>,
    ) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone())
            && !creep.spawning()
        {
            // Create exists and is not spawning, so we're ready
            info!("Creep {name} ready");
            call!([ctx], tick());
            return Some(Self { name, spot, source });
        }
        info!("Creep {name} not ready");
        timer!([ctx], game::time() + 1, Self::init(name, spot, source));
        None
    }

    pub fn body(energy: u32) -> Vec<Part> {
        // Eight work parts is enough to drain a source in 188t
        let segments = ((energy - Part::Carry.cost())
            / (2 * Part::Work.cost() + Part::Move.cost()))
        .clamp(1, 4);

        let mut body: Vec<Part> = (0..segments * 3)
            .map(|i| if i < segments { Part::Move } else { Part::Work })
            .collect();
        body.push(Part::Carry);
        body
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name().clone()) else {
            info!("Creep {} died, stopping", self.name());
            stop!([ctx]);
            return;
        };
        let Some(source) = self.source.resolve() else {
            warn!(
                "Creep {}'s source {} missing, stopping",
                self.name, self.source
            );
            stop!([ctx]);
            return;
        };
        let container = self.spot.look_for(look::STRUCTURES).ok().and_then(|s| {
            s.into_iter()
                .find_map(|s| TryInto::<StructureContainer>::try_into(s).ok())
        });
        let link: Option<StructureLink> = self
            .spot
            .find_in_range(find::MY_STRUCTURES, 1)
            .into_iter()
            .find_map(|s| s.try_into().ok());
        let pile = self.spot.look_for(look::RESOURCES).ok().and_then(|found| {
            found
                .into_iter()
                .find(|r| r.resource_type() == ResourceType::Energy)
        });

        trace!("Creep {} mining", self.name);

        if creep.pos() == self.spot {
            // Repair container, or mine, transfer energy to link, and pickup dropped energy
            if source.energy() == 0
                && let Some(container) = &container
                && container.hits() < container.hits_max()
                && creep.store().get_used_capacity(Some(ResourceType::Energy)) > 0
            {
                match creep.repair(container) {
                    Ok(()) => trace!(
                        "Creep {} repairing container at {}",
                        self.name(),
                        container.pos()
                    ),
                    Err(err) => trace!(
                        "Creep {} failed to repair container at {}: {}",
                        self.name(),
                        container.pos(),
                        err
                    ),
                }
            } else {
                self.mine(&creep, &source);

                // Transfer energy to the link
                if let Some(link) = link
                    && link.store().get_used_capacity(None) < LINK_CAPACITY
                {
                    // Get energy from the container
                    if let Some(container) = &container {
                        let result = creep.withdraw(container, ResourceType::Energy, None);
                        trace!(
                            "Creep {} withdrawing from container {} with {:?}",
                            self.name(),
                            container.pos(),
                            result
                        );
                    }
                    let result = creep.transfer(&link, ResourceType::Energy, None);
                    trace!(
                        "Creep {} transfering to link {} with {:?}",
                        self.name(),
                        link.pos(),
                        result
                    );
                } else if pile.is_none()
                    && let Some(container) = &container
                {
                    let result = creep.transfer(container, ResourceType::Energy, None);
                    trace!(
                        "Creep {} transfering to container {} with {:?}",
                        self.name(),
                        container.pos(),
                        result
                    );
                }

                // Pickup energy from the floor, if any
                if let Some(pile) = &pile {
                    trace!(
                        "Creep {} picking up from {} with {:?}",
                        self.name(),
                        pile.pos(),
                        creep.pickup(pile)
                    );
                }
            }
        } else {
            trace!("Creep {} moving", self.name);
            let pos = self.spot;
            self.move_to(creep, pos);
        }

        timer!([ctx], game::time() + 1, tick());
    }

    fn mine(&self, creep: &CreepObject, source: &Source) {
        match creep.harvest(source) {
            Ok(_) => {}
            Err(HarvestErrorCode::NotEnoughResources) => {
                if let Some(container) = self.spot.look_for(look::STRUCTURES).ok().and_then(|s| {
                    s.into_iter()
                        .find(|s| s.structure_type() == StructureType::Container)
                }) && let Some(container) = container.as_repairable()
                {
                    let _ = creep.repair(container);
                }
            }
            Err(err) => warn!("Creep {} harvested with {err}", self.name),
        }
    }
}

pub struct Tender {
    name: String,
    room: RoomName,
    target: Option<ObjectId<TransferableObject>>,
    state: CreepState,
}

impl Creep for Tender {
    fn name(&self) -> &String {
        &self.name
    }
}

impl Tender {
    pub fn init(ctx: &mut Context<'_, Self>, name: String, room: RoomName) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone())
            && !creep.spawning()
        {
            info!("Creep {name} ready");
            call!([ctx], tick());
            return Some(Self {
                name,
                room,
                target: None,
                state: CreepState::Work,
            });
        }
        timer!([ctx], game::time() + 1, Self::init(name, room));
        None
    }

    pub fn body(energy: u32) -> Vec<Part> {
        // Tenders can do at least two parts, but no need for more than thirty
        let parts = (energy / Part::Carry.cost()).clamp(2, 30);

        (0..parts)
            .map(|i| {
                if i < parts / 3 {
                    Part::Move
                } else {
                    Part::Carry
                }
            })
            .collect()
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name().clone()) else {
            info!("Creep {} died, stopping", self.name());
            stop!([ctx]);
            return;
        };

        match self.state {
            CreepState::Work => {
                if creep
                    .store()
                    .get_used_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    match self.target(&creep) {
                        Some(target) => self.tend(creep, target),
                        None => self.upgrade(creep),
                    }
                } else {
                    self.state = CreepState::GetEnergy;
                    call!([ctx], tick());
                    return;
                }
            }
            CreepState::GetEnergy => {
                if creep
                    .store()
                    .get_free_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    if let Some(storage) = creep.room().and_then(|room| room.storage())
                        && self.target.map(RawObjectId::from)
                            == Some(RawObjectId::from(storage.id()))
                    {
                        self.get_energy(
                            creep,
                            GetEnergyOptions {
                                prioritize_storage: false,
                                allow_storage: false,
                            },
                        );
                    } else {
                        self.get_energy(
                            creep,
                            GetEnergyOptions {
                                prioritize_storage: false,
                                allow_storage: true,
                            },
                        );
                    }
                } else {
                    self.state = CreepState::Work;
                    call!([ctx], tick());
                    return;
                }
            }
        }

        timer!([ctx], game::time() + 1, tick())
    }

    fn target(&mut self, creep: &CreepObject) -> Option<TransferableObject> {
        let Some(room) = game::rooms().get(self.room) else {
            warn!("Tender {}'s room not visible", self.name);
            return None;
        };

        if let Some(current) = self.target.and_then(|id| {
            id.into_type::<Structure>()
                .resolve()
                .map(StructureObject::from)
                .filter(|s| {
                    // When the existing target is the storage, force checking again for other
                    // targets
                    s.as_structure().structure_type() != StructureType::Storage
                        // Ensure the target needs energy
                        && s.as_has_store()
                            .map(|s| s.store().get_free_capacity(Some(ResourceType::Energy)) > 0)
                            .unwrap_or_default()
                })
                .and_then(|s| TransferableObject::try_from(s).ok())
        }) {
            return Some(current);
        }

        let targets = room.find(find::MY_STRUCTURES, None);
        let mut targets: Vec<StructureObject> = targets
            .into_iter()
            .filter(|s| {
                if !s.as_structure().is_active() {
                    return false;
                }

                match s.structure_type() {
                    StructureType::Spawn
                    | StructureType::Extension
                    | StructureType::Tower
                    | StructureType::Storage => {}
                    _ => return false,
                }

                let Some(store) = s.as_has_store() else {
                    return false;
                };

                store
                    .store()
                    .get_free_capacity(Some(screeps::ResourceType::Energy))
                    > 0
            })
            .collect();
        targets.sort_by_cached_key(|s| {
            std::cmp::Reverse(
                match creep.pos().find_path_to::<Position, Box<dyn FnMut(RoomName, CostMatrix) -> SingleRoomCostResult>, SingleRoomCostResult>(&s.pos(), None) {
                    screeps::Path::Vectorized(path) => path.len(),
                    screeps::Path::Serialized(_) => ROOM_AREA,
                } + match s.structure_type() {
                    StructureType::Spawn | StructureType::Extension => 0,
                    StructureType::Tower => 1,
                    StructureType::Storage => 2,
                    _ => 3,
                } * ROOM_USIZE,
            )
        });

        self.target = targets.pop().and_then(|t| {
            let id = t.as_structure().id().into_type::<TransferableObject>();
            TransferableObject::try_from(t).ok().and(Some(id))
        });

        self.target?
            .into_type::<Structure>()
            .resolve()
            .map(StructureObject::from)
            .and_then(|s| TransferableObject::try_from(s).ok())
    }

    fn tend(&mut self, creep: CreepObject, target: TransferableObject) {
        let pos = target.pos();
        if !creep.pos().is_near_to(pos) {
            self.move_to(creep, pos);
        } else if let Err(screeps::action_error_codes::TransferErrorCode::Full)
        | Err(screeps::action_error_codes::TransferErrorCode::NotOwner) =
            creep.transfer(&target, screeps::ResourceType::Energy, None)
        {
            {
                warn!("Creep {} unassigning target {}", self.name, pos);
                self.target = None;
            }
        }
    }
}

pub struct Upgrader {
    name: String,
    state: CreepState,
}

impl Creep for Upgrader {
    fn name(&self) -> &String {
        &self.name
    }
}

impl Upgrader {
    pub fn init(ctx: &mut Context<'_, Self>, name: String) -> Option<Self> {
        if let Some(creep) = game::creeps().get(name.clone())
            && !creep.spawning()
        {
            // Create exists and is not spawning, so we're ready
            info!("Creep {name} ready");
            call!([ctx], tick());
            return Some(Self {
                name,
                state: CreepState::Work,
            });
        }
        info!("Upgrader {name} not ready");
        timer!([ctx], game::time() + 1, Self::init(name));
        None
    }

    fn tick(&mut self, ctx: &mut Context<'_, Self>) {
        let Some(creep) = game::creeps().get(self.name().clone()) else {
            info!("Creep {} died, stopping", self.name());
            stop!([ctx]);
            return;
        };

        match self.state {
            CreepState::Work => {
                if creep
                    .store()
                    .get_used_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    self.upgrade(creep);
                } else {
                    self.state = CreepState::GetEnergy;
                    call!([ctx], tick());
                    return;
                }
            }
            CreepState::GetEnergy => {
                if creep
                    .store()
                    .get_free_capacity(Some(screeps::ResourceType::Energy))
                    > 0
                {
                    self.get_energy(creep, Default::default());
                } else {
                    self.state = CreepState::Work;
                    call!([ctx], tick());
                    return;
                }
            }
        }

        timer!([ctx], game::time() + 1, tick())
    }
}
