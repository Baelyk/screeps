abstract class CreepJob {
  abstract name: string;
  abstract tasks: CreepTask[];
  abstract isValid(): boolean;
  abstract do(): void;
}

abstract class CreepTask {
  abstract name: string;
  abstract do(): void;
}

class BuildJob extends CreepJob {
  name = "build";
  tasks = [GetEnergyTask, BuildTask];

  isValid(): boolean {
    return true;
  }

  site: Id<ConstructionSite>;

  constructor(site: Id<ConstructionSite>) {
    super();
    this.site = site;
  }

  do() {
    // Do stuff!
  }
}

class GetEnergyTask extends CreepTask {
  name = "get_energy";

  constructor() {
    super();
  }

  do(): void {
    console.log("hi");
  }
}

class BuildTask extends CreepTask {
  name = "get_energy";

  constructor() {
    super();
  }

  do(): void {
    console.log("HI");
  }
}
