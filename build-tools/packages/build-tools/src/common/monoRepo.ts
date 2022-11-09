/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { readFileSync } from "fs-extra";
import * as path from "path";
import YAML from "yaml";

import { fatal } from "../bumpVersion/utils";
import { Logger, defaultLogger } from "./logging";
import { Package, Packages } from "./npmPackage";
import { execWithErrorAsync, existsSync, readJsonSync, rimrafWithErrorAsync } from "./utils";

/**
 * Represents the different types of release groups supported by the build tools. Each of these groups should be defined
 * in the fluid-build section of the root package.json.
 */
export enum MonoRepoKind {
    Client = "client",
    Server = "server",
    Azure = "azure",
    BuildTools = "build-tools",
}

/**
 * A type guard used to determine if a string is a MonoRepoKind.
 */
export function isMonoRepoKind(str: string | undefined): str is MonoRepoKind {
    if (str === undefined) {
        return false;
    }

    const list = Object.values<string>(MonoRepoKind);
    const isMonoRepoValue = list.includes(str);
    return isMonoRepoValue;
}

/**
 * An iterator that returns only the Enum values of MonoRepoKind.
 */
export function* supportedMonoRepoValues(): IterableIterator<MonoRepoKind> {
    for (const [, flag] of Object.entries(MonoRepoKind)) {
        yield flag;
    }
}

/**
 * A monorepo is a collection of packages that are versioned and released together.
 *
 * @remarks
 *
 * A monorepo is configured using either package.json or lerna.json. The files are checked in the following way:
 *
 * - If lerna.json exists, it is checked for a `packages` AND a `version` field.
 *
 * - If lerna.json contains BOTH of those fields, then the values in lerna.json will be used. Package.json will not be
 *   read.
 *
 * - If lerna.json contains ONLY the version field, it will be used.
 *
 * - Otherwise, if package.json exists, it is checked for a `workspaces` field and a `version` field.
 *
 * - If package.json contains a workspaces field, then packages will be loaded based on the globs in that field.
 *
 * - If the version was not defined in lerna.json, then the version value in package.json will be used.
 */
export class MonoRepo {
    public readonly packages: Package[] = [];
    public readonly version: string;
    public readonly workspaceGlobs: string[];

    /**
     * Creates a new monorepo.
     *
     * @param kind The 'kind' of monorepo this object represents.
     * @param repoPath The path on the filesystem to the monorepo. This location is expected to have either a
     * package.json file with a workspaces field, or a lerna.json file with a packages field.
     * @param ignoredDirs Paths to ignore when loading the monorepo.
     */
    constructor(
        public readonly kind: MonoRepoKind,
        public readonly repoPath: string,
        ignoredDirs?: string[],
        private readonly logger: Logger = defaultLogger,
    ) {
        this.version = "";
        const pnpmWorkspace = path.join(repoPath, "pnpm-workspace.yaml");
        const lernaPath = path.join(repoPath, "lerna.json");
        const packagePath = path.join(repoPath, "package.json");
        let versionFromLerna = false;

        if (existsSync(lernaPath)) {
            const lerna = readJsonSync(lernaPath);
            if (lerna.version !== undefined) {
                logger.verbose(`${kind}: Loading version (${lerna.version}) from ${lernaPath}`);
                this.version = lerna.version;
                versionFromLerna = true;
            }

            let pkgs: string[] = [];

            if (existsSync(pnpmWorkspace)) {
                logger.verbose(`${kind}: Loading packages from ${pnpmWorkspace}`);
                const workspaceString = readFileSync(pnpmWorkspace, "utf-8");
                pkgs = YAML.parse(workspaceString).packages;
            } else if (lerna.packages !== undefined) {
                logger.verbose(`${kind}: Loading packages from ${lernaPath}`);
                pkgs = lerna.packages;
            }
            for (const dir of pkgs as string[]) {
                // TODO: other glob pattern?
                const loadDir = dir.endsWith("/**") ? dir.substr(0, dir.length - 3) : dir;
                this.packages.push(
                    ...Packages.loadDir(path.join(this.repoPath, loadDir), kind, ignoredDirs, this),
                );
            }
            this.workspaceGlobs = lerna.packages;
            return;
        }

        if (!existsSync(packagePath)) {
            throw new Error(`ERROR: package.json not found in ${repoPath}`);
        }
        const pkgJson = readJsonSync(packagePath);
        if (pkgJson.version === undefined && !versionFromLerna) {
            this.version = pkgJson.version;
            logger.verbose(`${kind}: Loading version (${pkgJson.version}) from ${packagePath}`);
        }

        if (pkgJson.workspaces !== undefined) {
            logger.verbose(`${kind}: Loading packages from ${packagePath}`);
            for (const dir of pkgJson.workspaces as string[]) {
                this.packages.push(...Packages.loadGlob(dir, kind, ignoredDirs, this));
            }
            this.workspaceGlobs = pkgJson.workspaces;
            return;
        }
        fatal(
            `Couldn't find lerna.json or package.json, or they were missing expected properties.`,
        );
    }

    public static isSame(a: MonoRepo | undefined, b: MonoRepo | undefined) {
        return a !== undefined && a === b;
    }

    public getNodeModulePath() {
        return path.join(this.repoPath, "node_modules");
    }

    public async install() {
        this.logger.info(`${this.kind}: Installing - npm i`);
        const installScript = "npm i";
        return execWithErrorAsync(installScript, { cwd: this.repoPath }, this.repoPath);
    }
    public async uninstall() {
        return rimrafWithErrorAsync(this.getNodeModulePath(), this.repoPath);
    }
}
