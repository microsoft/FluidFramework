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
        describe("View - React", () => {
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
                // Validate that there is an expected file
                const expectedFiles = ["README.md"];
                assert.file(expectedFiles);

                // Navigate to the temp folder that 
                const tempComponentPath = `${dirPath}/foobar`;
                shell.echo(`Navigating to temp path ${tempComponentPath}`);
                shell.cd(tempComponentPath);

                // Navigate to the temp folder that is created
                shell.echo("Running npm i - this can take some time...");
                const installResponse = shell.exec("npm i", { silent: true });
                assert.equal(installResponse.code, 0, `npm install failed with code: ${installResponse.code} - error: ${installResponse.stderr}`);
                
                // Run jest test for new component
                shell.echo("Running npm test - this can take some time...");
                const testResponse = shell.exec("npm test", { silent: true });
                assert.equal(testResponse.code && testResponse.code, 0, `npm test failed with code: ${testResponse.code} - error: ${testResponse.stderr}`);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });

        describe("View - None", () => {
            let runContext;
            let dirPath;
            let oldCwd;
            before(() => {
                oldCwd = process.cwd();
                runContext = helpers.run(path.join(__dirname, "../app/index.js"))
                    .withPrompts({
                        componentName: "foobar",
                        viewFramework: "none"
                    }).inTmpDir((dir) => {
                        dirPath = dir
                    });
                return runContext;
            });

            it("installs and runs tests tests with output", () => {
                // Validate that there is an expected file
                const expectedFiles = ["README.md"];
                assert.file(expectedFiles);

                // Navigate to the temp folder that 
                const tempComponentPath = `${dirPath}/foobar`;
                shell.echo(`Navigating to temp path ${tempComponentPath}`);
                shell.cd(tempComponentPath);

                // Navigate to the temp folder that is created
                shell.echo("Running npm i - this can take some time...");
                const installResponse = shell.exec("npm i", { silent: true });
                assert.equal(installResponse.code, 0, `npm install failed with code: ${installResponse.code} - error: ${installResponse.stderr}`);
                
                // Run jest test for new component
                shell.echo("Running npm test - this can take some time...");
                const testResponse = shell.exec("npm test", { silent: true });
                assert.equal(testResponse.code && testResponse.code, 0, `npm test failed with code: ${testResponse.code} - error: ${testResponse.stderr}`);
            });

            after(() => {
                process.chdir(oldCwd);
                runContext.cleanTestDirectory();
            });
        });
    });
});
