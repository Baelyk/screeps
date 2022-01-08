import { profile } from "utils/profiler";

declare global {
  interface RoomMemory {
    temporary?: number;
  }
}

@profile
export class RoomInfo {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  _memory?: RoomMemory;
  get memory(): RoomMemory {
    if (this._memory == undefined) {
      this._memory = Memory.rooms[this.name];
    }
    return this.memory;
  }
}
