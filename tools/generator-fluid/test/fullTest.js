/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const assert = require("yeoman-assert");
const helpers = require("yeoman-test");
const shell = require('shelljs');

describe("Yo fluid", function () {
    // Setting a 5 minute timeout since npm i can take a while
    this.timeout(300000);

    describe("End to End", () => {
        describe("React", () => {
            let runContext;
            let dirPath;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        componentName: "foobar",
                        viewFramework: "react"
                    }).inTmpDir((dir) => {
                        dirPath = dir
                    });
                return runContext;
            });

            it("installs and runs tests tests with output", () => {
                const expectedFiles = [
                    "README.md",
                ]
                assert.file(expectedFiles);

                shell.cd(`${dirPath}/foobar`);
                const installResponse = shell.exec("npm il");
                assert(installResponse.exitCode !== 0, 'install failed');
                // shell.exec("npm test");
                // 
                // assert(shell.exec('npm start').code !== 0, 'start failed')
                // .then((dir) => {
                //     assert(false, dir)
                // });
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });
    });
});
