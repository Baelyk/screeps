import { ProcessData, Process, ProcessConstructors } from "./process";

export class ForgetDeadCreeps extends Process {
	constructor(data: Omit<ProcessData<typeof Process>, "name">) {
		super({
			name: "ForgetDeadCreeps",
			...data,
		});
		this.generator = this.forgetDeadCreeps();
	}

	*forgetDeadCreeps() {
		while (true) {
			for (const name in Memory.creeps) {
				if (!(name in Game.creeps)) {
					this.info(`Deleting creep ${name} memory`);
					delete Memory.creeps[name];
				}
			}

			yield;
		}
	}
}
ProcessConstructors.set("ForgetDeadCreeps", ForgetDeadCreeps);
