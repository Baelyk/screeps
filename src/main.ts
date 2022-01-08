import { ErrorMapper } from "utils/ErrorMapper";
import { watcher } from "utils/watch-client";
import { tick } from "utils/logger";
import { TestClass } from "testing";

console.log("- - - - RESTARTING - - - -");
export const loop = ErrorMapper.wrapLoop(() => {
  tick();

  const test = new TestClass();
  console.log(test.count);
  console.log(test.count++);
  console.log(test.count);
  test.count += 10;
  console.log(test.count);

  // screeps-multimeter watcher
  watcher();
});
