/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileAsync } from "../common/utils";
import { Package } from "../common/npmPackage";
import { logVerbose } from "../common/logging";

interface DepCheckRecord {
    name: string,
    import: RegExp,
    declare: RegExp,
    peerImport?: RegExp,
    peerDeclare?: RegExp,
    found: boolean,
};

export class NpmDepChecker {
    // @types/socket.io-client is references in the tsconfig.json
    private readonly foundTypes: string[] = ["@types/socket.io-client", "@types/node", "@types/expect-puppeteer", "@types/jest-environment-puppeteer"];
    // hjs is implicitly used
    private readonly ignored = ["hjs", ...this.foundTypes];
    // list of packages that should always in the devDependencies
    private readonly dev = ["@fluidframework/build-common", "nyc", "typescript", "eslint", "mocha-junit-reporter", "mocha", "url-loader", "style-loader"];
    private readonly records: DepCheckRecord[] = [];
    private readonly altTyping = new Map<string, string>([["ws", "isomorphic-ws"]]);
    private readonly peerDependencies = new Map<string, string>([["ws", "socket.io-client"], ["@angular/compiler", "@angular/platform-browser-dynamic"]]);

    constructor(private readonly pkg: Package, private readonly checkFiles: string[]) {
        if (checkFiles.length !== 0) {
            for (const name of Object.keys(pkg.packageJson.dependencies)) {
                if (this.ignored.indexOf(name) !== -1) {
                    continue;
                }
                let packageName = name;
                if (name.startsWith("@types/")) {
                    // If we have a type package, we may still import the package, but not necessary depend on the package.
                    packageName = name.substring("@types/".length);
                }
                const peerPackage = this.peerDependencies.get(name);
                const packageMatch = peerPackage? `(${packageName}|${peerPackage})` : packageName;
                // These regexp doesn't aim to be totally accurate, but try to avoid false positives.
                // These can definitely be improved
                this.records.push({
                    name,
                    import: new RegExp(`(import|require)[^;]+[\`'"](blob-url-loader.*)?${packageMatch}.*[\`'"]`, "m"),
                    declare: new RegExp(`declare[\\s]+module[\\s]+['"]${packageMatch}['"]`, "m"),
                    found: false,
                });
            }
        }
    }

    public async run() {
        await this.check();
        return this.fix();
    }

    private async check() {
        let count = 0;
        for (const tsFile of this.checkFiles) {
            const content = await readFileAsync(tsFile, 'utf-8');
            for (const record of this.records) {
                if (record.found) {
                    continue;
                }
                if (!record.import.test(content) && !record.declare.test(content)) {
                    logVerbose(`${this.pkg.nameColored}: ${record.name} found in ${tsFile}`);
                    continue;
                }
                record.found = true;
                count++;
                if (count === this.records.length) {
                    return;
                }
            }
        }
    }
    private fix() {
        let changed = false;
        for (const depCheckRecord of this.records) {
            const name = depCheckRecord.name;
            if (name.startsWith("@types/")) {
                if (depCheckRecord.found) {
                    this.foundTypes.push(name);
                }
            } else if (!depCheckRecord.found) {
                if (this.dev.indexOf(name) != -1) {
                    console.warn(`${this.pkg.nameColored}: warning: misplaced dependency ${name}`);
                    this.pkg.packageJson.devDependencies[name] = this.pkg.packageJson.dependencies[name];
                } else {
                    console.warn(`${this.pkg.nameColored}: warning: unused dependency ${name}`);
                }
                changed = true;
                delete this.pkg.packageJson.dependencies[name];
            }
        }
        changed = this.depcheckTypes() || changed;
        return this.dupCheck() || changed;
    }

    private isInDependencies(name: string) {
        return (this.pkg.packageJson.dependencies && this.pkg.packageJson.dependencies[name] !== undefined)
            || (this.pkg.packageJson.devDependencies && this.pkg.packageJson.devDependencies[name] !== undefined);
    }

    private depcheckTypes() {
        let changed = false;
        for (const { name: dep } of this.pkg.combinedDependencies) {
            if (dep.startsWith("@types/") && this.foundTypes.indexOf(dep) === -1) {
                const typePkgName = dep.substring("@types/".length);
                const altName = this.altTyping.get(typePkgName);
                if (!(this.isInDependencies(typePkgName) || (altName && this.isInDependencies(altName)))) {
                    console.warn(`${this.pkg.nameColored}: warning: unused type dependency ${dep}`);
                    if (this.pkg.packageJson.devDependencies) {
                        delete this.pkg.packageJson.devDependencies[dep];
                    }
                    if (this.pkg.packageJson.dependencies) {
                        delete this.pkg.packageJson.dependencies[dep];
                    }
                    changed = true;
                }
            }
        }
        return changed;
    }

    private dupCheck() {
        if (!this.pkg.packageJson.devDependencies || !this.pkg.packageJson.dependencies) {
            return false;;
        }
        let changed = false;
        for (const name of Object.keys(this.pkg.packageJson.dependencies)) {
            if (this.pkg.packageJson.devDependencies[name] != undefined) {
                console.warn(`${this.pkg.nameColored}: warning: ${name} already in production dependency, deleting dev dependency`);
                delete this.pkg.packageJson.devDependencies[name];
                changed = true;
            }
        }
        return changed;
    }
};