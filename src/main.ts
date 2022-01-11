import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { Log } from "utils/log";
import { RoomInfo } from "rooms/info";
import { DummyJob } from "rooms/jobs";

declare global {
  interface Memory {
    [key: string]: any;
  }
}

console.log("==> RESTARTING <==");
export const loop = ErrorMapper.wrapLoop(() => {
  Log.tick();

  const info = new RoomInfo("W8N3");
  info.jobs.print();
  info.jobs.add(new DummyJob());
  info.jobs.print();
  info.jobs.add(new DummyJob());
  info.jobs.print();
  // screeps-multimeter watcher
  watcher();
});
