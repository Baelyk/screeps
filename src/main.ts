import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { Log } from "utils/log";

console.log("==> RESTARTING <==");
export const loop = ErrorMapper.wrapLoop(() => {
  // screeps-multimeter watcher
  watcher();
});
