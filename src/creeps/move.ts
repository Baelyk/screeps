import { warn, errorConstant } from "utils/logger";
import { Position } from "classes/position";

export interface MoveCommand {
  destination: Position;
  range: number;
  options?: MoveActionOptions;
}

interface MoveActionOptions {
  range: number;
  avoidHostiles: boolean;
  costCallback: (roomName: string, costMatrix: CostMatrix) => CostMatrix | void;
  flee: boolean;
  reusePath: number;
  repair: boolean;
}

function actionWarn(
  creep: Creep,
  action: string,
  response: ScreepsReturnCode,
): void {
  warn(
    `Creep ${
      creep.name
    } tried to perform ${action} with response ${errorConstant(response)}`,
  );
}

class Move {
  static move(
    creep: Creep,
    target: RoomPosition,
    providedOptions?: Partial<MoveActionOptions>,
  ): ScreepsReturnCode {
    const MOVE_ACTION_DEFAULTS: MoveActionOptions = {
      range: 0,
      avoidHostiles: true,
      costCallback: () => {
        return;
      },
      flee: false,
      reusePath: 5,
      repair: true,
    };
    const options: MoveActionOptions = _.assign(
      MOVE_ACTION_DEFAULTS,
      providedOptions,
    );

    if (
      providedOptions == undefined ||
      providedOptions.costCallback == undefined
    ) {
      options.costCallback = costCallback;
    }
    if (
      providedOptions == undefined ||
      providedOptions.reusePath == undefined
    ) {
      if (creep.room.name !== target.roomName) {
        options.reusePath = 50;
      }
    }

    function costCallback(
      roomName: string,
      costMatrix: CostMatrix,
    ): CostMatrix | void {
      let changed = false;
      // Block off tiles within range 3 of hostile creeps
      if (options.avoidHostiles) {
        const room = Game.rooms[roomName];
        if (room != undefined) {
          changed = true;
          const hostiles = room.find(FIND_HOSTILE_CREEPS);
          _.forEach(hostiles, (hostile) => {
            // Only consider hostiles with attack parts
            if (
              hostile.getActiveBodyparts(ATTACK) > 0 ||
              hostile.getActiveBodyparts(RANGED_ATTACK) > 0
            ) {
              const surrounding = Position.getSurrounding(hostile.pos, 3);
              _.forEach(surrounding, (pos) =>
                costMatrix.set(pos.x, pos.y, 255),
              );
            }
          });
        }
      }

      if (changed) {
        return costMatrix;
      }
    }

    if (options.flee && options.range <= 1) {
      warn(`Creep ${creep.name} fleeing without range, canceling flee`);
    }

    // Repair as we go
    if (
      options.repair &&
      creep.getActiveBodyparts(WORK) > 0 &&
      creep.getActiveBodyparts(CARRY) > 0 &&
      creep.store[RESOURCE_ENERGY] > 0
    ) {
      const target = creep.pos
        .lookFor(LOOK_STRUCTURES)
        .find((structure) => structure.hits < structure.hitsMax);
      if (target != undefined) {
        creep.repair(target);
      }
    }

    let response: ScreepsReturnCode;
    if (options.flee) {
      const path = PathFinder.search(
        creep.pos,
        { pos: target, range: options.range },
        { flee: options.flee },
      ).path;
      response = creep.moveByPath(path);
    } else {
      response = creep.moveTo(target, options);
    }

    if (response !== OK && response !== ERR_TIRED && warn) {
      actionWarn(creep, "move", response);
    }

    return response;
  }
}

export const move = Move.move;
