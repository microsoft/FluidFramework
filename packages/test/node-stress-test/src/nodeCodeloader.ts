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
        private readonly waitTimeoutMSec: number) {
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
        return entry;
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const components = pkg.match(/(.*)\/(.*)@(.*)/);
        // eslint-disable-next-line no-null/no-null
        if (components === null) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = components;

        const packageDirectory = `${this.packageDirectory}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        // Install the versioned package if not already present.
        if (!fs.existsSync(packageDirectory)) {
            fs.mkdirSync(packageDirectory, { recursive: true });

            // Copy over the root .npmrc (if present) to the directory where npm install will be executed.
            if (fs.existsSync(`${this.packageDirectory}/.npmrc`)) {
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
