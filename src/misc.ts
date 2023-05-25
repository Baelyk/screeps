import { info } from "./utils/logger";
import { ProcessData, Process, ProcessConstructors } from "./process";

function* forgetDeadCreeps(): Generator<void, never, never> {
	while (true) {
		for (const name in Memory.creeps) {
			if (!(name in Game.creeps)) {
				info(`Deleting creep ${name} memory`);
				delete Memory.creeps[name];
			}
		}

		yield;
	}
}

export class ForgetDeadCreeps extends Process {
	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({
			name: "ForgetDeadCreeps",
			...data,
			generator: forgetDeadCreeps(),
		});
	}
}
ProcessConstructors.set("ForgetDeadCreeps", ForgetDeadCreeps);
