/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "./npmPackage";
import * as path from "path";
import { execWithErrorAsync, rimrafWithErrorAsync, existsSync, readJsonSync, readFileAsync, ExecAsyncResult, writeFileAsync} from "./utils";

export enum MonoRepoKind {
    Client,
    Server,
};

export class MonoRepo {
    public readonly packages: Package[] = [];
    constructor(public readonly kind: MonoRepoKind, public readonly repoPath: string) {
        const lernaPath = path.join(repoPath, "lerna.json");
        if (!existsSync(lernaPath)) {
            throw new Error(`ERROR: lerna.json not found in ${repoPath}`);
        }
        const lerna = readJsonSync(lernaPath);
        for (const dir of lerna.packages as string[]) {
            // TODO: other glob pattern?
            const loadDir = dir.endsWith("/**") ? dir.substr(0, dir.length - 3) : dir;
            this.packages.push(...Packages.loadDir(path.join(this.repoPath, loadDir), this));
        }
    }

    public static isSame(a: MonoRepo | undefined, b: MonoRepo | undefined) {
        return a !== undefined && a === b;
    }

    public getNodeModulePath() {
        return path.join(this.repoPath, "node_modules");
    }

    public async install() {
        // TODO: Remove env once publish to the public feed.
        const env = process.env["NPM_TOKEN"]? process.env : { ...process.env, "NPM_TOKEN": "" };
        console.log(`${MonoRepoKind[this.kind]}: Installing - npm i`);
        const installScript = "npm i";
        return execWithErrorAsync(installScript, { cwd: this.repoPath, env }, this.repoPath);
    }
    public async uninstall() {
        return rimrafWithErrorAsync(this.getNodeModulePath(), this.repoPath);
    }
};