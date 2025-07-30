import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { Kernel } from "./kernel";

// TextEncoder/Decoder for WASM modules
import "fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js";

console.log("- - - - RESTARTING - - - -");
global.USERNAME = "Baelyk";
const kernel = Kernel.init();
export const loop = ErrorMapper.wrapLoop(() => {
	kernel.tick();

	// screeps-multimeter watcher
	watcher();
});

declare global {
	namespace NodeJS {
		interface Global {
			USERNAME: string;
		}
	}
}
