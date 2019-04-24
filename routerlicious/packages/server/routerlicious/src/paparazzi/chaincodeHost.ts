import { IChaincodeFactory, ICodeLoader, IPlatform, IPlatformFactory } from "@prague/container-definitions";
import { exec } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs";
import { promisify } from "util";
import * as winston from "winston";

const asyncExec = promisify(exec);

const packageWaitTimeoutMS = 30000;
const npmRegistry = "https://packages.wu2.prague.office-int.com";
const packagesBase = `/tmp/chaincode`;
const signalFileName = "dummy";

export class NodeCodeLoader implements ICodeLoader {
    public async load<T>(pkg: string): Promise<T> {
        const codeEntrypoint = await this.installOrWaitForPackages(pkg);
        const entry = import(codeEntrypoint);
        // tslint:disable:no-unsafe-any
        return entry;
    }

    private async installOrWaitForPackages(pkg: string): Promise<string> {
        const components = pkg.match(/(.*)\/(.*)@(.*)/);
        if (!components) {
            return Promise.reject("Invalid package");
        }
        const [, scope, name] = components;

        const packageDirectory = `${packagesBase}/${pkg}`;
        const signalPath = `${packageDirectory}/${signalFileName}`;
        const codeEntrypoint = `${packageDirectory}/node_modules/${scope}/${name}`;

        if (!fs.existsSync(packageDirectory)) {
            // Our node verison (8.15) does not support recursive directory creation.
            // Need to create each subdirectories manually.
            const dirs = pkg.split("/");
            if (!fs.existsSync(`${packagesBase}/${dirs[0]}`)) {
                fs.mkdirSync(`${packagesBase}/${dirs[0]}`);
            }
            if (!fs.existsSync(packageDirectory)) {
                fs.mkdirSync(packageDirectory);
            }

            // Copy over template package.json and .npmrc file to the directory where
            // npm install will be executed.
            fs.copyFileSync(`${packagesBase}/package.json`, `${packageDirectory}/package.json`);
            fs.copyFileSync(`${packagesBase}/.npmrc`, `${packageDirectory}/.npmrc`);

            // Run npm install
            await asyncExec(`npm install ${pkg} --registry ${npmRegistry}`, { cwd: packageDirectory });

            // Write dummy signal file to indicate package installation success.
            fs.closeSync(fs.openSync(signalPath, "w"));

            winston.info(`Installed ${pkg} in ${packageDirectory} directory`);
            return codeEntrypoint;
        } else {
            await this.waitForPackageFiles(packageDirectory, signalFileName, packageWaitTimeoutMS);
            winston.info(`Package ${pkg} is already installed`);
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

class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        return;
    }
}

export class NodePlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new NodePlatform();
    }
}
