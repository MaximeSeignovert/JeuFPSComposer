try {
  require("./dist/server/src/index.js");
} catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") throw error;
  require("tsx/cjs");
  require("./server/src/index.ts");
}
