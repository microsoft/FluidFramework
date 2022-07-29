/**
 * Mocha configuration file to run memory-profiling tests
 */

module.exports = {
    exit: true,
    fgrep: "@Benchmark",
    "node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
    recursive: true,
    reporter: "node_modules/@fluid-tools/benchmark/dist/MochaMemoryTestReporter.js",
    reporterOptions: ["reportDir=.memoryTestsOutput/"],
    require: ["@fluidframework/mocha-test-setup"],
    spec: ["dist/test/memory/**/*.spec.js", "--perfMode"],
    timeout: "60000"
}
