declare global {
  interface Memory {
    test: TestMemory;
  }

  interface TestMemory {
    count: number;
  }
}

export class TestClass {
  _memory?: TestMemory;
  get memory(): TestMemory {
    if (this._memory == undefined) {
      if (Memory.test == undefined) {
        Memory.test = { count: 0 };
      }
      this._memory = Memory.test;
    }
    return this._memory;
  }

  get count(): number {
    return this.memory.count;
  }

  set count(value: number) {
    this.memory.count = value;
  }
}
