module.exports = {
    "node-option": ["expose_gc", "gc_global", "unhandled-rejections=strict"], // without leading "--"
    recursive: true,
    //reporter: "dist/test/memory/reporter.js",
    reporter: "node_modules/@fluid-tools/benchmark/dist/MochaMemoryReporter.js",
    require: ["@fluidframework/mocha-test-setup"],
    spec: ["dist/test/memory/**/*.spec.js", "--perfMode", "--parentProcess", "--exit", "--fgrep", "@Benchmark"]
}


//"test:mocha:memory": "cross-env FLUID_TEST_VERBOSE=1 mocha --config src/.mocharc.memory.js",
