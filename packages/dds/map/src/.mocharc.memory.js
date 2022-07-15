module.exports = {
    exit: true,
    fgrep: "@Benchmark",
    "node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
    recursive: true,
    reporter: "node_modules/@fluid-tools/benchmark/dist/MochaMemoryReporter.js",
    require: ["@fluidframework/mocha-test-setup"],
    spec: ["dist/test/memory/**/*.spec.js", "--perfMode"],
    timeout: "60000"
}


//"test:mocha:memory": "cross-env FLUID_TEST_VERBOSE=1 mocha --config src/.mocharc.memory.js",
