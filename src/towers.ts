import {
  build,
  buildRoad,
  getSurroundingTiles,
  updateWallRepair,
} from "construct";
import { errorConstant, info, warn } from "utils/logger";
import { countBodyPart, hasBodyPart } from "utils/helpers";
import { GetByIdError, GetPositionError, wrapper } from "utils/errors";

export function towerBehavior(tower: StructureTower): void {
  // const tower = Game.getObjectById(towerId) as StructureTower;

  let target: Creep | Structure | null = aquireHostileTarget(tower);

  // If there are no hostile creeps, heal/repair instead
  if (target == undefined) {
    // Heal creeps first
    const lowHealthCreeps = tower.room.find(FIND_MY_CREEPS, {
      filter: (creep) => creep.hits < creep.hitsMax,
    });
    if (lowHealthCreeps.length > 0) {
      target = _.min(lowHealthCreeps, "hits");
    }

    // If all creeps are full health, repair instead
    if (target == undefined) {
      // However, only do so if the tower has more than 200 energy. This allows
      // a reserve to attack/heal in case a tower is no longer being resupplied,
      // like if the tender dies (and is taking a while to spawn, or can't spawn).
      if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > 200) {
        // Intentionally not using fromRepairQueue() as to not remove from the queue
        target = Game.getObjectById(
          tower.room.memory.repairQueue[0],
        ) as Structure;
        // If the target is full health, take it off the queue
        while (target != undefined && target.hits === target.hitsMax) {
          if (target.hits === target.hitsMax) {
            tower.room.memory.repairQueue.shift();
          }
          target = Game.getObjectById(tower.room.memory.repairQueue[0]);
        }

        // There are no creeps, structures to target
        if (target == undefined) {
          updateWallRepair(tower.room);
          target = Game.getObjectById(tower.room.memory.wallRepairQueue[0]);
          if (target != undefined) {
            target = target as Structure;
            // Target is a wall/rampart in need of repair
            const response = errorConstant(tower.repair(target));
            if (response !== "OK") {
              info(`Tower ${tower.id} is repairing ${target.id}: ${response}`);
            }
          }
          return;
        }

        // Target is a structure in need of repair
        const response = errorConstant(tower.repair(target));
        if (response !== "OK") {
          info(`Tower ${tower.id} is repairing ${target.id}: ${response}`);
        }
      } else {
        info(`Tower ${tower.id} is in energy saver mode`);
      }
    } else {
      info(JSON.stringify(target));
      // Target is an injured friendly creep
      const response = errorConstant(tower.heal(target));
      if (response !== "OK") {
        info(`Tower ${tower.id} is healing creep ${target.name}: ${response}`);
      }
    }
  } else {
    // Target is a hostile creep
    const response = errorConstant(tower.attack(target));
    warn(
      `Tower ${tower.id} is attacking ${target.owner.username}'s creep ${target.name}: ${response}`,
    );
  }
}

export function buildTower(roomName: string): void {
  const room = Game.rooms[roomName];

  const spawn = room.find(FIND_MY_SPAWNS)[0];
  const pos = room.getPositionAt(spawn.pos.x - 5, spawn.pos.y);

  if (pos === null) {
    throw new GetPositionError({
      x: spawn.pos.x - 5,
      y: spawn.pos.y,
      roomName,
    });
  }

  const response = build(pos, STRUCTURE_TOWER);

  if (response) {
    info(`Successfully queued tower at ${JSON.stringify(pos)}`);
    const roads = getSurroundingTiles(pos, 1);
    buildRoad(roads);
  } else {
    warn(`Failed to build tower at ${JSON.stringify(pos)}`);
  }
}

function aquireHostileTarget(tower: StructureTower): Creep | null {
  const hostiles = tower.room.find(FIND_HOSTILE_CREEPS);
  if (hostiles.length == 0) {
    return null;
  }

  // Create an array of potential hostiles while maintaining a list of all
  // hostiles.
  let potentials = hostiles;
  const invalids: Creep[] = [];
  let target: Creep | undefined = undefined;

  // Target healers first, but within reason
  const healers = potentials.filter((creep) => hasBodyPart(creep, HEAL));
  target = healers.find((creep) => {
    const healParts = countBodyPart(creep.body, HEAL);
    // For now, save by assuming the minimum damage
    const damage = calculateTowerFalloff(tower, creep, TowerAction.attack);
    // If the tower deals more damage than the creep can heal, target it. Each
    // HEAL part can do 12 self heal.
    if (damage > healParts * 12) {
      return true;
    } else {
      invalids.push(creep);
    }

    return false;
  });
  // Filter out creeps that can self heal away the damage
  potentials = potentials.filter((creep) => invalids.indexOf(creep) === -1);

  // While there are potential targets left
  while (target == undefined && potentials.length > 0) {
    if (target == undefined) {
      // By default, target the "first" creep
      target = potentials.shift();
    }

    if (target != undefined) {
      const surrounding = getSurroundingTiles(target.pos, 1);
      // If a creep was made invalid because it could heal itself, it could
      // out heal the damage to this creep too.
      const healer = invalids.find((creep) => {
        let contained = false;
        surrounding.forEach((pos) => {
          // Short circuit if contained is already true
          contained =
            contained || (pos.x === creep.pos.x && pos.y === creep.pos.y);
        });
        return contained;
      });
      // If such a healer was found, target someone else
      if (healer != undefined) {
        target = undefined;
      }
    }
  }

  if (target == undefined) {
    info(`Tower ${tower.id} unable to find worthwhile hostile to target`);
  }

  // Convert undefined to null
  return target || null;
}

declare const enum TowerAction {
  attack = "attack",
  heal = "heal",
  repair = "repair",
}

function calculateTowerFalloff(
  tower: StructureTower,
  target: Creep | PowerCreep | Structure,
  action: TowerAction,
): number {
  const range = tower.pos.getRangeTo(target);
  let amount = 0;
  switch (action) {
    case TowerAction.attack:
      amount = TOWER_POWER_ATTACK;
      break;
    case TowerAction.heal:
      amount = TOWER_POWER_HEAL;
      break;
    case TowerAction.repair:
      amount = TOWER_POWER_REPAIR;
      break;
  }
  return (
    amount -
    (amount * TOWER_FALLOFF * (range - TOWER_OPTIMAL_RANGE)) /
      (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE)
  );
}

export function towerManager(room: Room): void {
  for (const towerIndex in room.memory.towers) {
    const tower = Game.getObjectById(
      room.memory.towers[towerIndex],
    ) as StructureTower;
    if (tower !== null) {
      wrapper(
        () => towerBehavior(tower),
        `Error processing tower ${tower.id} behavior`,
      );
    } else {
      throw new GetByIdError(
        room.memory.towers[towerIndex],
        STRUCTURE_TOWER,
        `The tower should be in room ${room.name}`,
      );
    }
  }
}
