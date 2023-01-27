/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = {
    extends: [require.resolve("@fluidframework/eslint-config-fluid/minimal"), "prettier"],
    parserOptions: {
        project: ["./tsconfig.json", "./src/test/tsconfig.json"],
    },
    rules: {
        "@typescript-eslint/no-shadow": "off",
        "space-before-function-paren": "off", // Off because it conflicts with typescript-formatter
        "import/no-nodejs-modules": ["error", { allow: ["v8", "perf_hooks", "child_process"] }],
    },
    overrides: [
        {
            // Rules only for reporter files. They are expected to run only in node so libraries can be used.
            files: ["src/MochaMemoryTestReporter.ts", "src/Reporter.ts"],
            rules: {
                "import/no-nodejs-modules": ["error", { allow: ["fs", "path"] }],
            },
        },
    ],
};
