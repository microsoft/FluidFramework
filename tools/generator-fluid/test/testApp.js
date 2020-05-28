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
        let runContext;
        let oldCwd;
        before(() => {
            oldCwd = process.cwd();
            runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                .withPrompts({
                    componentName: "foobar",
                    template: "react"
                });
            return runContext;
        });

        it("Produces the expected files", () => {
            const expectedFiles = [
                "src/component.tsx",
                "src/index.ts",
                "src/model.ts",
                "src/view.tsx",
                ".gitignore",
                ".npmrc",
                "package.json",
                "README.md",
                "tsconfig.json",
                "webpack.config.js",
            ]
            assert.file(expectedFiles);

            const unexpectedFiles = [
                "src/component.ts",
                "src/view.ts",
            ]
            assert.noFile(unexpectedFiles);
        });

        after(() => {
            process.chdir(oldCwd);
            runContext.cleanTestDirectory();
        });
    });

    describe("Vanilla", () => {
        let runContext;
        let oldCwd;
        before(() => {
            oldCwd = process.cwd();
            runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                .withPrompts({
                    componentName: "foobar",
                    template: "vanillaJS"
                });
            return runContext;
        });

        it("Produces the expected files", () => {
            const expectedFiles = [
                "src/component.ts",
                "src/index.ts",
                "src/model.ts",
                "src/view.ts",
                ".gitignore",
                ".npmrc",
                "package.json",
                "README.md",
                "tsconfig.json",
                "webpack.config.js",
            ]
            assert.file(expectedFiles);

            const unexpectedFiles = [
                "src/component.tsx",
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
