/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const assert = require("yeoman-assert");
const helpers = require("yeoman-test");

describe("Yo fluid", function () {
    // increasing the timeout, since generation can sometimes exceed the default 2000ms.
    this.timeout(10000);

    describe("Unit", () => {
        describe("View - React - advanced", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        dataObjectName: "foobar",
                        viewFramework: "react",
                        scaffolding: "advanced",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
                const expectedFiles = [
                    "src/dataObject.tsx",
                    "src/index.ts",
                    "src/interface.ts",
                    "src/view.tsx",
                    ".gitignore",
                    "jest-puppeteer.config.js",
                    "jest.config.js",
                    "package.json",
                    "README.md",
                    "tsconfig.json",
                    "webpack.config.js",
                ]
                assert.file(expectedFiles);

                const unexpectedFiles = [
                    "src/dataObject.ts",
                    "src/view.ts",
                ]
                assert.noFile(unexpectedFiles);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("View - React - beginner", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        dataObjectName: "foobar",
                        viewFramework: "react",
                        scaffolding: "beginner",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
                const expectedFiles = [
                    "src/dataObject.tsx",
                    "src/index.ts",
                    ".gitignore",
                    "jest-puppeteer.config.js",
                    "jest.config.js",
                    "package.json",
                    "README.md",
                    "tsconfig.json",
                    "webpack.config.js",
                ]
                assert.file(expectedFiles);

                const unexpectedFiles = [
                    "src/dataObject.ts",
                    "src/view.ts",
                ]
                assert.noFile(unexpectedFiles);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("View - None - advanced", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        dataObjectName: "foobar",
                        viewFramework: "none",
                        scaffolding: "advanced",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
                const expectedFiles = [
                    "src/dataObject.ts",
                    "src/index.ts",
                    "src/interface.ts",
                    "src/view.ts",
                    ".gitignore",
                    "jest-puppeteer.config.js",
                    "jest.config.js",
                    "package.json",
                    "README.md",
                    "tsconfig.json",
                    "webpack.config.js",
                ]
                assert.file(expectedFiles);

                const unexpectedFiles = [
                    "src/dataObject.tsx",
                    "src/view.tsx",
                ]
                assert.noFile(unexpectedFiles);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("View - None - beginner", () => {
            let runContext;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        dataObjectName: "foobar",
                        viewFramework: "none",
                        scaffolding: "beginner",
                    });
                return runContext;
            });

            it("Produces the expected files", () => {
                const expectedFiles = [
                    "src/dataObject.ts",
                    "src/index.ts",
                    ".gitignore",
                    "jest-puppeteer.config.js",
                    "jest.config.js",
                    "package.json",
                    "README.md",
                    "tsconfig.json",
                    "webpack.config.js",
                ]
                assert.file(expectedFiles);

                const unexpectedFiles = [
                    "src/dataObject.tsx",
                    "src/view.tsx",
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
