import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { Kernel } from "./kernel";

console.log("- - - - RESTARTING - - - -");
const kernel = Kernel.init();
export const loop = ErrorMapper.wrapLoop(() => {
	kernel.tick();

	// screeps-multimeter watcher
	watcher();
});
