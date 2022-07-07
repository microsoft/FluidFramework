// @ts-check
const { preset, just, esbuildBuildTask } = require("@fluidx/office-bohemia-build-tools/just-preset");
const { task, series } = just;

preset();

task("build", series("ts"));

task("lint", "linter");

task(
  "bundle",
  esbuildBuildTask({
    configPath: "./esbuild.config.js"
  })
);
