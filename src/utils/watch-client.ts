declare global {
  interface Memory {
    watch: ScreepsMultimeterWatch;
  }

  interface ScreepsMultimeterWatch {
    // eslint-disable-next-line @typescript-eslint/ban-types
    expressions?: object | undefined;
    values?: { [index: string]: any };
  }
}

export function watcher(): void {
  if (typeof Memory.watch !== "object") {
    Memory.watch = {};
  }
  if (typeof Memory.watch.expressions !== "object") {
    Memory.watch.expressions = {};
  }
  if (typeof Memory.watch.values !== "object") {
    Memory.watch.values = {};
  }
  for (const [expr, name] of Object.entries(Memory.watch.expressions)) {
    if (Memory.watch.values == undefined || name == undefined) return;
    if (typeof expr !== "string") return;
    let result;
    try {
      result = eval(expr);
    } catch (ex) {
      result = "Error: " + ex.message;
    }
    if (name == "console") {
      if (typeof result !== "undefined") console.log(result);
    } else {
      Memory.watch.values[name] =
        typeof result !== "undefined" ? result.toString() : result;
    }
  }
}
