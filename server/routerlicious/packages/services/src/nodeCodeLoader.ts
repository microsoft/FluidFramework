/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Move this in a separate package.
// import { ICodeLoader, ICodeAllowList, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { exec } from "child_process";
import * as fs from "fs";
import { promisify } from "util";
import * as winston from "winston";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

const asyncExec = promisify(exec);

// A sentinel file to indicate install completion.
const signalFileName = "dummy";

export class NodeAllowList {
    constructor() {

    }

    public async testSource(source: any) {
        return Promise.resolve(true);
    }
}

export class NodeCodeLoader {
    constructor(
        private readonly packageDirectory: string,
        private readonly waitTimeoutMSec: number,
        private readonly allowList: any) {
    }

    public async load<T>(pkg: any): Promise<T> {
        if (await this.allowList.testSource(pkg)) {
            let packageName = "";
            packageName = typeof pkg.package === "string"
                ? pkg.package
                : `${pkg.package.name}@${pkg.package.version}`;
            const codeEntrypoint = await this.installOrWaitForPackages(packageName);
            const entry = import(codeEntrypoint);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return entry;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.reject(new Error("Invalid Package"));
        }
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const dataStores = pkg.match(/(.*)\/(.*)@(.*)/);
        if (!dataStores) {
            return Promise.reject(new Error("Invalid package"));
        }
        const [, scope, name] = dataStores;

        const packageDirectory = `${this.packageDirectory}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        if (!fs.existsSync(packageDirectory)) {
            // Our node version (8.15) does not support recursive directory creation.
            // Need to create each subdirectories manually.
            const dirs = pkg.split("/");
            if (!fs.existsSync(`${this.packageDirectory}/${dirs[0]}`)) {
                fs.mkdirSync(`${this.packageDirectory}/${dirs[0]}`);
            }
            if (!fs.existsSync(packageDirectory)) {
                fs.mkdirSync(packageDirectory);
            }

            // Copy over template package.json and .npmrc file to the directory where
            // npm install will be executed.
            fs.copyFileSync(`${this.packageDirectory}/package.json`, `${packageDirectory}/package.json`);
            fs.copyFileSync(`${this.packageDirectory}/.npmrc`, `${packageDirectory}/.npmrc`);

            // Run npm install
            await asyncExec(`npm install ${pkg}`, { cwd: packageDirectory });

            // Write dummy signal file to indicate package installation success.
            fs.closeSync(fs.openSync(signalPath, "w"));

            winston.info(`Installed ${pkg} in ${packageDirectory} directory`);
            Lumberjack.info(`Installed ${pkg} in ${packageDirectory} directory`);
            return codeEntrypoint;
        } else {
            await this.waitForPackageFiles(packageDirectory, signalFileName, this.waitTimeoutMSec);
            winston.info(`Package ${pkg} is already installed`);
            Lumberjack.info(`Package ${pkg} is already installed`);
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
