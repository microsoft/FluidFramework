/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: Move this in a seperate package.
// import { ICodeLoader, ICodeWhiteList, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { exec } from "child_process";
import * as fs from "fs";
import { promisify } from "util";
import * as winston from "winston";

const asyncExec = promisify(exec);

// A sentinel file to indicate install completion.
const signalFileName = "dummy";

export class NodeWhiteList {
    constructor() {

    }

    public async testSource(source: any) {
        return Promise.resolve(true);
    }
}

export class NodeCodeLoader {
    constructor(
        private readonly registry: string,
        private readonly packageDirectory: string,
        private readonly waitTimeoutMSec: number,
        private readonly whiteList: any) {
    }

    public async load<T>(pkg: any): Promise<T> {
        if (await this.whiteList.testSource(pkg)) {
            let packageName = "";
            if (typeof pkg.package === "string") {
                packageName = pkg.package;
            } else {
                packageName = `${pkg.package.name}@${pkg.package.version}`;
            }
            const codeEntrypoint = await this.installOrWaitForPackages(packageName);
            const entry = import(codeEntrypoint);
            return entry;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            Promise.reject("Invalid Package");
        }
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
        const components = pkg.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = components;

        const packageDirectory = `${this.packageDirectory}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        if (!fs.existsSync(packageDirectory)) {
            // Our node verison (8.15) does not support recursive directory creation.
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
            await asyncExec(`npm install ${pkg} --registry ${this.registry}`, { cwd: packageDirectory });

            // Write dummy signal file to indicate package installation success.
            fs.closeSync(fs.openSync(signalPath, "w"));

            winston.info(`Installed ${pkg} in ${packageDirectory} directory`);
            return codeEntrypoint;
        } else {
            await this.waitForPackageFiles(packageDirectory, signalFileName, this.waitTimeoutMSec);
            winston.info(`Package ${pkg} is already installed`);
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
