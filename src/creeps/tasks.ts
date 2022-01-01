//interface CreepJob {
//jobName: string;
//tasks: CreepTask[];
//isValid: () => boolean;
//do: (creep: Creep, currentTask: CreepTask) => void;
//}

interface CreepTask {
  name: string;
  do: () => void;
}

const GetEnergyTask: CreepTask = {
  name: "get_energy",
  do: () => console.log("getting energy"),
};

const BuildTask: CreepTask = {
  name: "build",
  do: () => console.log("building"),
};

abstract class CreepJob {
  static jobName: string;
  static tasks: CreepTask[];
  abstract isValid(): boolean;
  abstract do(): void;
}

class BuildJob extends CreepJob {
  static jobName = "build";
  static tasks = [GetEnergyTask, BuildTask];

  site: Id<ConstructionSite>;

  constructor(site: Id<ConstructionSite>) {
    super();

    this.site = site;
  }

  isValid(): boolean {
    return true;
  }

  do(): void {
    1 + 1;
  }
}
