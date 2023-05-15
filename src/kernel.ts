import { info, error, tick as logTick } from "./utils/logger";
import { ProcessTable } from "./processTable";
import { Process, ProcessId, ForgetDeadCreeps, ManageRoom } from "./process";
import { Scheduler } from "./scheduler";

export class Kernel {
  processTable = new ProcessTable();
  scheduler = new Scheduler(this.processTable);

  constructor() {
    info("Rebuilding kernel");
  }

  static init(): Kernel {
    const kernel = new Kernel();
    global.kernel = kernel;

    kernel.processTable.addProcess(
      new ForgetDeadCreeps(kernel.processTable.getNextId()),
    );

    for (const name in Game.rooms) {
      const room = Game.rooms[name];
      kernel.processTable.addProcess(
        new ManageRoom(kernel.processTable.getNextId(), room),
      );
    }

    return kernel;
  }

  tick(): void {
    logTick();

    this.scheduler.update();

    while (true) {
      const process = this.scheduler.next();
      if (process == undefined) {
        info("All done");
        break;
      }

      try {
        info(`Running process ${process.display()}`);
        const code = process.run();
        if (code <= 0) {
          info(`Process ${process.display()} has stopped with ${code}`);
          this.processTable.removeProcess(process.id);
        }
      } catch (err) {
        error(`Error while running process:\n${err}`);
      }
    }
  }

  spawnProcess(process: Process): ProcessId {
    const id = this.processTable.getNextId();
    process.id = id;
    this.processTable.addProcess(process);
    return id;
  }

  hasProcess(id: ProcessId): boolean {
    return this.processTable.getProcess(id) != undefined;
  }
}

/* eslint-disable */
declare global {
  module NodeJS {
    interface Global {
      kernel: Kernel;
    }
  }
}
