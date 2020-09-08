/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { exec } from "child_process";
import * as fs from "fs";
import { promisify } from "util";

const asyncExec = promisify(exec);

// A sentinel file to indicate install completion.
const signalFileName = "dummy";

/**
 * Installs a versioned npm package to the desired directory on a local file system. Once installed, it returns
 * the code through the entry point. To guard against concurrent writes, the class uses a sentinel file approach
 * to guard against concurrent writes.
 */
// TODO: Consolidate this into a common library with no other service dependencies.
export class NodeCodeLoader {
    constructor(
        private readonly packageDirectory: string,
        private readonly waitTimeoutMSec: number,
        private readonly useLocalDirectory: boolean = true,
    ) {}

    public async load<T>(pkg: any): Promise<T> {
        let packageName = "";
        if (typeof pkg.package === "string") {
            packageName = pkg.package;
        } else {
            packageName = `${pkg.package.name}@${pkg.package.version}`;
        }
        const codeEntrypoint = await this.installOrWaitForPackages(packageName);
        const entry = import(codeEntrypoint);
        return entry;
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const fluidObjects = pkg.match(/(.*)\/(.*)@(.*)/);
        // eslint-disable-next-line no-null/no-null
        if (fluidObjects === null) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = fluidObjects;

        const packageDirectory = `${this.packageDirectory}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        // Install the versioned package if not already present.
        if (!fs.existsSync(signalPath) || !fs.existsSync(codeEntrypoint)) {
            const pkgDirExists = fs.existsSync(packageDirectory);
            if (!pkgDirExists || this.useLocalDirectory) {
                if (!pkgDirExists) {
                    fs.mkdirSync(packageDirectory, { recursive: true });
                }
                // Copy over the root .npmrc (if present) to the directory where npm install will be executed.
                if (this.useLocalDirectory) {
                    if (fs.existsSync(`${__dirname}/../.npmrc`)) {
                        fs.copyFileSync(`${__dirname}/../.npmrc`, `${packageDirectory}/.npmrc`);
                    }
                } else if (fs.existsSync(`${this.packageDirectory}/.npmrc`)) {
                        fs.copyFileSync(`${this.packageDirectory}/.npmrc`, `${packageDirectory}/.npmrc`);
                }

                // Run npm install
                await asyncExec(`npm install ${pkg}`, { cwd: packageDirectory });

                // Write dummy signal file to indicate package installation success.
                fs.closeSync(fs.openSync(signalPath, "w"));
            } else {
                // If the local flag is false and pkg directory exists, only then wait for the signal file.
                // Consider 2 processes trying to load the code at same time. One process start and create the
                // pkg directory, then other process tris to load the code. Process 2 will see that pkg directory
                // is already created, so it will just wait for the process 1 to install the pkg and use that.
                // However, there is a limitation, because if something bad happens while installing the pkg by
                // Process 1, then even pkg 2 would not try to install the pkg. But for exp purposes, it is fine.
                await this.waitForPackageFiles(packageDirectory, signalFileName, this.waitTimeoutMSec);
            }
        }
        // Return entry point.
        return codeEntrypoint;
    }

    // A timeout based watcher that looks for dummy file creation.
    private async waitForPackageFiles(targetDirectory: string, fileName: string, waitTimeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const watcher = fs.watch(targetDirectory, (eventType, newFileName) => {
                if (eventType === "rename" && newFileName === fileName) {
                    // eslint-disable-next-line @typescript-eslint/no-use-before-define
                    clearTimeout(waitTimer);
                    watcher.close();
                    resolve();
                }
            });
            const waitTimer = setTimeout(() => {
                watcher.close();
                clearTimeout(waitTimer);
                reject(`${fileName} in ${targetDirectory} was not generated within ${waitTimeout} msecs`);
            }, waitTimeout);

            if (fs.existsSync(`${targetDirectory}/${fileName}`)) {
                clearTimeout(waitTimer);
                watcher.close();
                resolve();
            }
        });
    }
}
