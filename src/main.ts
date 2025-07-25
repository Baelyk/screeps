import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { Kernel } from "./kernel";

// TextEncoder/Decoder for WASM modules
import "fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js";

import { greet } from "hello-from-rust/Cargo.toml";
import { testing } from "planner/Cargo.toml";

console.log("- - - - RESTARTING - - - -");
global.USERNAME = "Baelyk";
const kernel = Kernel.init();
export const loop = ErrorMapper.wrapLoop(() => {
	greet();
	console.log(testing());

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
