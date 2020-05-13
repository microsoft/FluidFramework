/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const assert = require("yeoman-assert");
const helpers = require("yeoman-test");

describe("Yo fluid", function () {
    // increasing the timeout, since generation can sometimes exceed the default 2000ms.
    this.timeout(10000);

    describe("React", () => {
        describe("With container", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        name: "foobar",
                        template: "react",
                        container: "yes",
                        description: "Fluid starter project",
                        path: "./foobar",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
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

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("Without container", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        name: "foobar",
                        template: "react",
                        container: "no",
                        description: "Fluid starter project",
                        path: "./foobar",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
                const expectedFiles = [
                    "src/main.tsx",
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
                    "src/index.ts",
                ]
                assert.noFile(unexpectedFiles);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });
    });

    describe("Vanilla", () => {
        describe("With container", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        name: "foobar",
                        template: "vanillaJS",
                        container: "yes",
                        description: "Fluid starter project",
                        path: "./foobar",
                    });
                return runContext;
            });

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

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("Without container", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        name: "foobar",
                        template: "vanillaJS",
                        container: "no",
                        description: "Fluid starter project",
                        path: "./foobar",
                    });
                return runContext;
            });

            it("Produces the expected files", async () => {
                const expectedFiles = [
                    "src/main.ts",
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
                    "src/index.ts",
                ]
                assert.noFile(unexpectedFiles);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });
    });
});
