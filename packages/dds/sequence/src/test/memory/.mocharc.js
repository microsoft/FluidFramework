/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Mocha configuration file to run memory-profiling tests
 */

 module.exports = {
    exit: true,
    fgrep: ["@Benchmark", "@MemoryUsage"],
    "node-option": ["expose-gc", "gc-global", "unhandled-rejections=strict"], // without leading "--"
    recursive: true,
    reporter: "../../../node_modules/@fluid-tools/benchmark/dist/MochaMemoryTestReporter.js", // Lerna hoists the external dependency on @fluid-tools/benchmark to the root
    reporterOptions: ["reportDir=.memoryTestsOutput/"],
    require: ["@fluidframework/mocha-test-setup"],
    spec: ["dist/test/memory/**/*.spec.js", "--perfMode"],
    timeout: "60000"
}
