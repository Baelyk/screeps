declare global {
  interface Memory {
    profiler: ProfilerMemory;
  }
  let printProfileData: () => void;
}

type ProfilerMemoryData = { [key: string]: FunctionProfilerMemory };
interface ProfilerMemory {
  data: ProfilerMemoryData;
  start: number;
}

interface FunctionProfilerMemory {
  name: string;
  calls: number;
  cpu: number;
}

export function profile(
  decorated: any,
  key?: string | number | symbol,
  descriptor?: PropertyDescriptor,
) {
  // `key` is only defined when decorating a method
  if (key != undefined && descriptor != undefined) {
    descriptor.value = wrapFunction(decorated, key);
    return;
  }

  // Decorating a class
  if (decorated.prototype == undefined) {
    return;
  }

  const name = decorated.name;
  // Wrap instance members
  Reflect.ownKeys(decorated.prototype).forEach((key) => {
    const wrapped = wrapFunction(decorated.prototype, key, name);
    Reflect.set(decorated.prototype, key, wrapped);
  });
  // Wrap static members
  Reflect.ownKeys(decorated).forEach((key) => {
    const wrapped = wrapFunction(decorated, key, name);
    Reflect.set(decorated, key, wrapped);
  });
}

function wrapFunction(
  obj: any,
  key: string | number | symbol,
  className?: string,
) {
  // Don't wrap the constructor
  if (key === "constructor") {
    return;
  }

  // Don't wrap if the descriptor is undefined for some reason
  const descriptor = Reflect.getOwnPropertyDescriptor(obj, key);
  if (descriptor == undefined) {
    return;
  }

  const unwrapped = descriptor.value;
  // Only wrap functions
  if (unwrapped == undefined || typeof unwrapped !== "function") {
    return;
  }
  // Save the unwrapped function with a `__` prefix
  const unwrappedName = `__${String(key)}`;
  if (Reflect.has(obj, unwrappedName)) {
    return;
  }
  Reflect.set(obj, unwrappedName, unwrapped);

  // Profiler name: [class.]functionName
  const profilerName = `${className ? `${className}.` : ""}${String(key)}`;
  addToProfiler(profilerName);

  // Wrap the function and set it as the old function
  return function (this: any, ...args: any[]): any {
    const start = Game.cpu.getUsed();
    const result = Reflect.apply(unwrapped, this, args);
    const used = Game.cpu.getUsed() - start;
    updateProfilerData(profilerName, used);
    return result;
  };
}

function addToProfiler(name: string): void {
  if (Memory.profiler == undefined || Memory.profiler.data == undefined) {
    Profiler.init();
  }
  if (Memory.profiler.data[name] != undefined) {
    console.log(`Duplicated profiler entry ${name}`);
  }
  Memory.profiler.data[name] = {
    name,
    calls: 0,
    cpu: 0,
  };
}

function updateProfilerData(name: string, cpu: number): void {
  try {
    Memory.profiler.data[name].calls++;
    Memory.profiler.data[name].cpu += cpu;
  } catch (error) {
    console.log(`Error updating profiler data for ${name}:\n${error}`);
  }
}

function truncPadLeft(str: string | number, length: number): string {
  // Truncate to length - 1 and pad to length (always at least 1 space)
  return _.padLeft(
    _.trunc(String(str), { length: length - 1, omission: "" }),
    length,
  );
}

// CLI
class Profiler {
  static init(): void {
    Memory.profiler = { data: {}, start: Game.time };
  }

  static reset(): void {
    if (Memory.profiler == undefined || Memory.profiler.data == undefined) {
      Profiler.init();
    }

    Memory.profiler.start = Game.time;

    for (const name in Memory.profiler.data) {
      Memory.profiler.data[name] = {
        name,
        calls: 0,
        cpu: 0,
      };
    }
  }

  static print(): void {
    const ticks = Game.time - Memory.profiler.start || 1;
    const data = Memory.profiler.data;
    const longest = _.max(data, (entry) => entry.name.length).name.length;
    const width = Math.floor((80 - longest) / 5);

    let output = `Profiled ${
      _.keys(data).length
    } functions for ${ticks} ticks\n`;
    output += truncPadLeft("name", longest);
    output += truncPadLeft("calls", width);
    output += truncPadLeft("c/t", width);
    output += truncPadLeft("cpu", width);
    output += truncPadLeft("cpu/c", width);
    output += truncPadLeft("cpu/t", width);
    output += "\n";

    const profiled = _.sortBy(data, (entry) => -entry.cpu / entry.calls);

    let totalCpu = 0;
    _.forEach(profiled, (entry) => {
      const { name, calls, cpu } = entry;
      output += truncPadLeft(name, longest);
      output += truncPadLeft(calls, width);
      output += truncPadLeft(calls / ticks, width);
      output += truncPadLeft(cpu, width);
      output += truncPadLeft(cpu / calls || 0, width);
      output += truncPadLeft(cpu / ticks, width);
      output += "\n";
      totalCpu += cpu;
    });

    const printTotal = Math.round(totalCpu * 100) / 100;
    const printAvg = Math.round((totalCpu / ticks) * 100) / 100;
    output += _.padLeft(
      `${printTotal} cpu total | ${printAvg} avg cpu`,
      longest + width * 5,
    );

    console.log(output);
  }
}

global.Profiler = Profiler;

/* eslint-disable */
declare global {
  module NodeJS {
    interface Global {
      Profiler: Profiler;
    }
  }
}
