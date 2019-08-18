/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFileAsync } from "./common/utils";
import { Package } from "./npmPackage";

interface DepCheckRecord {
    name: string,
    import: RegExp,
    declare: RegExp,
    found: boolean,
};

export class NpmDepChecker {
    // @types/socket.io-client is references in the tsconfig.json
    private readonly foundTypes: string[] = ["@types/socket.io-client", "@types/node"];
    // hjs is implicitly used
    private readonly ignored = ["hjs", ...this.foundTypes];
    // list of packages that should always in the devDependencies
    private readonly dev = ["@prague/build-common", "nyc", "typescript", "tslint", "mocha-junit-reporter", "mocha"];
    private records: DepCheckRecord[] = [];

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
                // These regexp doesn't aim to be totally accurate, but try to avoid false positives.
                // These can definitely be improved
                this.records.push({
                    name,
                    import: new RegExp(`(import|require)[^;]+[\`'"](blob-url-loader.*)?${packageName}.*[\`'"]`, "m"),
                    declare: new RegExp(`declare[\\s]+module[\\s]+['"]${packageName}['"]`, "m"),
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
                    console.warn(`${this.pkg.nameColored}: WARNING: misplaced dependency ${name}`);
                    this.pkg.packageJson.devDependencies[name] = this.pkg.packageJson.dependencies[name];
                } else {
                    console.warn(`${this.pkg.nameColored}: WARNING: unused dependency ${name}`);
                }
                changed = true;
                delete this.pkg.packageJson.dependencies[name];
            }
        }
        return this.depcheckTypes() || changed;
    }

    private depcheckTypes() {
        let changed = false;
        for (const dep of this.pkg.dependencies) {
            if (dep.startsWith("@types/") && this.foundTypes.indexOf(dep) === -1) {
                const name = dep.substring("@types/".length);
                if ((!this.pkg.packageJson.dependencies || this.pkg.packageJson.dependencies[name] === undefined)
                    && (!this.pkg.packageJson.devDependencies || this.pkg.packageJson.devDependencies[name] === undefined)) {
                    console.warn(`${this.pkg.nameColored}: WARNING: unused type dependency ${dep}`);
                    delete this.pkg.packageJson.devDependencies[dep];
                    delete this.pkg.packageJson.dependencies[dep];
                    changed = true;
                }
            }
        }
        return changed;
    }
};