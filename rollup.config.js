"use strict";

import clear from "rollup-plugin-clear";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";
import screeps from "rollup-plugin-screeps";
import rust from "@wasm-tool/rollup-plugin-rust";
import yaml from "js-yaml";
import fs from "node:fs";

const dest = process.env.DEST;
if (!dest) {
	console.log(
		"No destination specified - code will be compiled but not uploaded",
	);
}
const cfg = yaml.load(fs.readFileSync(".screeps.yaml")).servers[dest];
if (cfg == null) {
	throw new Error("Invalid upload destination");
}

export default {
	input: "src/main.ts",
	output: {
		file: "dist/main.js",
		format: "cjs",
		sourcemap: true,
		// No `asset` directory
		assetFileNames: "[name]-[hash][extname]",
	},

	// Silence the "(!) `this` has been rewritten to `undefined`" error
	moduleContext: {
		"node_modules/fastestsmallesttextencoderdecoder-encodeinto/EncoderDecoderTogether.min.js":
			"this",
	},

	plugins: [
		clear({ targets: ["dist"] }),
		rust({
			// https://github.com/rustyscreeps/screeps-game-api/issues/391
			wasmOptArgs: ["-O4", "-g"],
			useRequire: true,
			typescriptDeclarations: true,
			experimental: {
				directExports: true,
			},
		}),
		resolve(),
		commonjs(),
		// Don't abort on error so that WASM types can be generated (plugin
		// order is not respected).
		typescript({ abortOnError: false }),
		screeps({ config: cfg, dryRun: cfg == null }),
	],
};
