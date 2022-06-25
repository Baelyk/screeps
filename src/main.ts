import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { tick } from "utils/logger";

console.log("- - - - RESTARTING - - - -");
export const loop = ErrorMapper.wrapLoop(() => {
  tick();

  // screeps-multimeter watcher
  watcher();
});
