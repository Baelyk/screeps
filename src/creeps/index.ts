export { creepManager } from "./behavior";
export {
  AnyCreepMemory,
  CreepInfo,
  CreepRole,
  CreepRoleList,
  CreepTask,
  RoleCreepInfo,
} from "./memory";
export { countRole } from "./utils";
// The RoleCreepMemory declarations actually happen in "./memory", but this
// allows for importing all the roles grouped together, without also getting all
// exports from "./memory".
export * as RoleCreepMemory from "./roleMemoryInterfaces";
