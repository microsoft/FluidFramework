/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as chalk from "chalk";
import * as fs from "fs";
import * as path from "path";
import { logVerbose } from "./common/logging";
import { globFn, writeFileAsync } from "./common/utils"
import { NpmDepChecker } from "./npmDepChecker";

interface IPerson {
    name: string;
    email: string;
    url: string;
}

interface IPackage {
    name: string;
    version: string;
    description: string;
    keywords: string[];
    homepage: string;
    bugs: { url: string; email: string };
    license: string;
    author: IPerson;
    contributors: IPerson[];
    files: string[];
    main: string;
    // Same as main but for browser based clients (check if webpack supports this)
    browser: string;
    bin: { [key: string]: string };
    man: string | string[];
    repository: string | { type: string; url: string };
    scripts: { [key: string]: string | undefined };
    config: { [key: string]: string };
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
    peerDependencies: { [key: string]: string };
    bundledDependencies: { [key: string]: string };
    optionalDependencies: { [key: string]: string };
    engines: { node: string; npm: string };
    os: string[];
    cpu: string[];
};

export class Package {
    private static packageCount: number = 0;
    private static readonly chalkColor = [
        chalk.default.red,
        chalk.default.green,
        chalk.default.yellow,
        chalk.default.blue,
        chalk.default.magenta,
        chalk.default.cyan,
        chalk.default.white,
        chalk.default.grey,
        chalk.default.redBright,
        chalk.default.greenBright,
        chalk.default.yellowBright,
        chalk.default.blueBright,
        chalk.default.magentaBright,
        chalk.default.cyanBright,
        chalk.default.whiteBright,
    ];
    public static load(dir: string): Array<Package> {
        const packages = new Array<Package>();
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.map((dirent) => {
            if (dirent.isDirectory()) {
                if (dirent.name !== "node_modules") {
                    packages.push(...Package.load(path.join(dir, dirent.name)));
                }
                return;
            }
            if (dirent.isFile() && dirent.name === "package.json") {
                const packageJsonFileName = path.join(dir, "package.json");
                packages.push(new Package(packageJsonFileName))
            }
        });
        return packages;
    }

    public readonly packageJson: Readonly<IPackage>;
    private readonly packageId = Package.packageCount++;
    private _matched: boolean = false;
    private _markForBuild: boolean = false;

    constructor(private readonly packageJsonFileName: string) {
        this.packageJson = require(packageJsonFileName);
        logVerbose(`Package Loaded: ${this.nameColored}`);
    }

    public get name(): string {
        return this.packageJson.name;
    }

    public get nameColored(): string {
        return this.color(this.name);
    }

    public get version(): string {
        return this.packageJson.version;
    }

    public get matched() {
        return this._matched;
    }

    public setMatched() {
        this._matched = true;
        this._markForBuild = true;
    }

    public get markForBuild() {
        return this._markForBuild;
    }

    public setMarkForBuild() {
        this._markForBuild = true;
    }

    public get dependencies() {
        const it = function* (packageJson: IPackage) {
            for (const item in packageJson.dependencies) {
                yield (item);
            }
            for (const item in packageJson.devDependencies) {
                yield (item);
            }
        }
        return it(this.packageJson);
    }

    public get directory(): string {
        return path.dirname(this.packageJsonFileName);
    }

    public getScript(name: string): string | undefined {
        return this.packageJson.scripts[name];
    } 

    public async depcheck() {
        let checkFiles: string[];
        if (this.packageJson.dependencies) {
            const tsFiles = await globFn(`${this.directory}/**/*.ts`, { ignore: `${this.directory}/node_modules` });
            const tsxFiles = await globFn(`${this.directory}/**/*.tsx`, { ignore: `${this.directory}/node_modules` });
            checkFiles = tsFiles.concat(tsxFiles);
        } else {
            checkFiles = [];
        }

        const npmDepChecker = new NpmDepChecker(this, checkFiles);
        if (await npmDepChecker.run()) {
            await writeFileAsync(this.packageJsonFileName, `${JSON.stringify(this.packageJson, undefined, 2)}\n`);
        }
    }

    private get color() {
        return Package.chalkColor[this.packageId % Package.chalkColor.length];
    }
};
