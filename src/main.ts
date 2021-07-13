import { ErrorMapper } from "utils/ErrorMapper";
import { tick } from "utils/logger";
import { testing } from "classes/graph";

console.log("- - - - RESTARTING - - - -");

export const loop = ErrorMapper.wrapLoop(() => {
  tick();
  testing();
});
