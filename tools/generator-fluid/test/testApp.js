/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const assert = require("yeoman-assert");
const path = require("path");
const helpers = require("yeoman-test");

describe("Yo fluid", function () {
    // increasing the timeout, since generation can sometimes exceed the default 2000ms.
    this.timeout(10000);

    describe("React", () => {
        beforeEach(() => {
            return helpers.run(path.join(__dirname, "../app/index.js"))
                .withPrompts({
                    name: "foobar",
                    template: "react",
                    description: "Fluid starter project",
                    path: "./foobar",
                });
        })
        it("Produces the expected files", async () => {
            const expectedFiles = [
                "src/main.tsx",
                "src/index.ts",
                ".gitignore",
                ".npmignore",
                ".npmrc",
                "package.json",
                "README.md",
                "tsconfig.json",
                "webpack.config.js",
                "webpack.dev.js",
                "webpack.prod.js",
            ]
            assert.file(expectedFiles);

            const unexpectedFiles = [
                "src/main.ts",
            ]
            assert.noFile(unexpectedFiles);
        });
    });

    describe("Vanilla", () => {
        beforeEach(() => {
            return helpers.run(path.join(__dirname, "../app/index.js"))
                .withPrompts({
                    name: "foobar",
                    template: "vanillaJS",
                    description: "Fluid starter project",
                    path: "./foobar",
                });
        })
        it("Produces the expected files", async () => {
            const expectedFiles = [
                "src/main.ts",
                "src/index.ts",
                ".gitignore",
                ".npmignore",
                ".npmrc",
                "package.json",
                "README.md",
                "tsconfig.json",
                "webpack.config.js",
                "webpack.dev.js",
                "webpack.prod.js",
            ]
            assert.file(expectedFiles);

            const unexpectedFiles = [
                "src/main.tsx",
            ]
            assert.noFile(unexpectedFiles);
        });
    });
});
