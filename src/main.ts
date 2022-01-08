import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";

console.log("==> RESTARTING <==");
export const loop = ErrorMapper.wrapLoop(() => {
  console.log(Game.time);

  // screeps-multimeter watcher
  watcher();
});
