/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, Packages } from "./npmPackage";
import * as path from "path";
import YAML from "yaml";
import { execWithErrorAsync, rimrafWithErrorAsync, existsSync, readJsonSync } from "./utils";
import { readFileSync } from "fs-extra";

export enum MonoRepoKind {
    Client,
    Server,
};

export class MonoRepo {
    public readonly packages: Package[] = [];
    public readonly version: string;
    constructor(public readonly kind: MonoRepoKind, public readonly repoPath: string, ignoredDirs?: string[]) {
        const lernaPath = path.join(repoPath, "lerna.json");
        if (!existsSync(lernaPath)) {
            throw new Error(`ERROR: lerna.json not found in ${repoPath}`);
        }
        const lerna = readJsonSync(lernaPath);
        if (lerna.packages) {
            for (const dir of lerna.packages as string[]) {
                // TODO: other glob pattern?
                const loadDir = dir.endsWith("/**") ? dir.substr(0, dir.length - 3) : dir;
            	this.packages.push(...Packages.loadDir(path.join(this.repoPath, loadDir), MonoRepoKind[kind], ignoredDirs, this));
            }
        } else if (existsSync(path.join(repoPath, "pnpm-workspace.yaml"))) {
            this.packages.push(...this.loadWorkspacesFromPnpm(repoPath));
        } else {
            // look for workspaces in package.json
            this.packages.push(...this.loadWorkspacesFromPackage(repoPath));
        }
        this.version = lerna.version;
    }

    private loadWorkspacesFromPackage(packagePath: string, ignoredDirs?: string[]): Package[] {
        const pkgJsonPath = path.join(packagePath, "package.json");
        const pkg = readJsonSync(pkgJsonPath);
        const packages: Package[] = [];

        for (const dir of pkg.workspaces) {
            if (dir.endsWith("/")) {
                // ignore these for now
                // this.packages.push(...this.loadWorkspaces(dir.substr(0, dir.length - 1)));
            }
            else if (dir.endsWith("/**") || dir.endsWith("*/*")) {
                const loadDir = path.join(this.repoPath, dir.substr(0, dir.length - 3));
                packages.push(...Packages.loadDir(loadDir, MonoRepoKind[this.kind], ignoredDirs, this));
            }
        }
        return packages;
    }

    private loadWorkspacesFromPnpm(packagePath: string, ignoredDirs?: string[]): Package[] {
        const packages: Package[] = [];
        const pkgPath = path.join(packagePath || this.repoPath, "pnpm-workspace.yaml");
        const content = readFileSync(pkgPath, "utf-8");
        const config = YAML.parse(content);

        for (const dir of config.packages as string[]) {
            console.log(dir);
        }

        for (const d of config.packages as string[]) {
            console.log(d);
            if (d.endsWith("/")) {
                const loadDir = path.join(this.repoPath, d.substr(0, d.length - 1));
                packages.push(...Packages.loadDir(loadDir, MonoRepoKind[this.kind], ignoredDirs, this));
            }
            else if (d.endsWith("/**") || d.endsWith("*/*")) {
                const loadDir = path.join(this.repoPath, d.substr(0, d.length - 3));
                packages.push(...Packages.loadDir(loadDir, MonoRepoKind[this.kind], ignoredDirs, this));
            }
        }
        return [];
    }

    public static isSame(a: MonoRepo | undefined, b: MonoRepo | undefined) {
        return a !== undefined && a === b;
    }

    public getNodeModulePath() {
        return path.join(this.repoPath, "node_modules");
    }

    public async install() {
        console.log(`${MonoRepoKind[this.kind]}: Installing - npm i`);
        const installScript = "npm i";
        return execWithErrorAsync(installScript, { cwd: this.repoPath }, this.repoPath);
    }
    public async uninstall() {
        return rimrafWithErrorAsync(this.getNodeModulePath(), this.repoPath);
    }
};
