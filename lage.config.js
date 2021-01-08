module.exports = {
    "pipeline": {
        "l-build": [
            "^tsc",
            // "^build:compile",
            // "^build:esnext",
            "^build:copy",
        ],
        "l-build:test": [
            "l-build",
            "^build:test",
        ],
        "l-lint": [
            "eslint"
        ],
        "l-clean": [
            "clean",
        ],
        "l-webpack": [
            "l-build",
            "^webpack",
        ],

        // Tasks below this should *only* have dependencies on lage tasks
        "l-build:full": [
            "l-build",
            "l-lint",
        ],
        // "tsc": [
        //     "^tsc"
        // ],
        "l-test": [
            "l-build"
        ],
    },
    "npmClient": "yarn",
    "cacheOptions": {
        // cacheStorageConfig: { provider: "local" },
        // clearOutputFolder: false,
        // internalCacheFolder: ".cache/backfill",
        // logFolder: ".cache/backfill",
        logLevel: "silly",
        // mode: "READ_WRITE",
        // name: "[name-of-package]",
        outputGlob: ["lib/**", "dist/**"],
        // packageRoot: ".",
        // producePerformanceLogs: false,
        // validateOutput: false
    },
};
