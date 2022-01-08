import { profile } from "utils/profiler";
import { RoomInfo } from "./info";

@profile
export class RoomActor extends RoomInfo {
  constructor(name: string) {
    super(name);
  }
}
