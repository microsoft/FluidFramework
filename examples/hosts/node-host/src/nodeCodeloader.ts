/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
        private readonly useLocalDirectory: boolean = true) {
    }

    public async load<T>(pkg: any): Promise<T> {
        let packageName = "";
        if (typeof pkg.package === "string") {
            packageName = pkg.package;
        } else {
            packageName = `${pkg.package.name}@${pkg.package.version}`;
        }
        const codeEntrypoint = await this.installOrWaitForPackages(packageName);
        const entry = import(codeEntrypoint);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return entry;
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const fluidObjects = pkg.match(/(.*)\/(.*)@(.*)/);
        // eslint-disable-next-line no-null/no-null
        if (fluidObjects === null) {
            return Promise.reject(new Error("Invalid package"));
        }
        const [, scope, name] = fluidObjects;

        const packageDirectory = `${this.packageDirectory}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        // Install the versioned package if not already present.
        if (!fs.existsSync(packageDirectory)) {
            fs.mkdirSync(packageDirectory, { recursive: true });

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

            // Return entry point.
            return codeEntrypoint;
        } else {
            await this.waitForPackageFiles(packageDirectory, signalFileName, this.waitTimeoutMSec);
            return codeEntrypoint;
        }
    }

    // A timeout based watcher that looks for dummy file creation.
    private async waitForPackageFiles(targetDirectory: string, fileName: string, waitTimeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const watcher = fs.watch(targetDirectory, (eventType, newFileName) => {
                if (eventType === "rename" && newFileName === fileName) {
                    clearTimeout(waitTimer);
                    watcher.close();
                    resolve();
                }
            });
            const waitTimer = setTimeout(() => {
                watcher.close();
                clearTimeout(waitTimer);
                reject(new Error(`${fileName} in ${targetDirectory} was not generated within ${waitTimeout} msecs`));
            }, waitTimeout);

            if (fs.existsSync(`${targetDirectory}/${fileName}`)) {
                clearTimeout(waitTimer);
                watcher.close();
                resolve();
            }
        });
    }
}
