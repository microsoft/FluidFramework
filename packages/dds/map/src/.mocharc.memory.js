module.exports = {
    "node-option": ["expose_gc", "gc_global", "unhandled-rejections=strict", "inspect-brk"], // without leading "--"
    recursive: true,
    //reporter: "dist/test/memory/reporter.js",
    reporter: "node_modules/@fluid-tools/benchmark/dist/MochaMemoryReporter.js",
    require: ["@fluidframework/mocha-test-setup"],
    spec: ["dist/test/memory/**/*.spec.js", "--perfMode"]
}
