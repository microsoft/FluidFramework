/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import { commonOptions } from "./commonOptions";
import { existsSync, realpathAsync, readJsonAsync, lookUpDir, isDirectory } from "./utils";
import * as path from "path";
import { logVerbose } from "./logging";
import { FluidRepoName } from "./fluidRepoBase";

async function isFluidRootLerna(dir: string, fluidRepoName: FluidRepoName) {
    const filename = path.join(dir, "lerna.json");
    if (!existsSync(filename)) {
        logVerbose(`InferRoot: lerna.json not found`);
        return false;
    }

    switch(fluidRepoName) {
        case FluidRepoName.FDL:
            if (!existsSync(path.join(dir, "server", "routerlicious", "lerna.json"))) {
                logVerbose(`InferRoot: server/routerlicious/lerna.json not found`);
                return false;
            }
            break;
        case FluidRepoName.Default:
            if (existsSync(path.join(dir, "server")) && !existsSync(path.join(dir, "server", "lerna.json"))) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    if (isDirectory(file) && existsSync(path.join(file, "lerna.json"))) {
                        return true;
                    }
                    logVerbose(`InferRoot: server/lerna.json not found nor did any child directories within the server folder.
                    If server packages do exist and are not being detected, please add the specific server path to InferRoot.`);
                    return false;
                }
            }
    }
    return true;
}

async function isFluidRootPackage(dir: string) {
    const filename = path.join(dir, "package.json");
    if (!existsSync(filename)) {
        logVerbose(`InferRoot: package.json not found`);
        return false;
    }

    const parsed = await readJsonAsync(filename);
    if (parsed.name === "root" && parsed.private === true) {
        return true;
    }
    logVerbose(`InferRoot: package.json not matched`);
    return false;
}

async function isFluidRoot(dir: string, fluidRepoName: FluidRepoName) {
    return await isFluidRootLerna(dir, fluidRepoName) && await isFluidRootPackage(dir);
}

async function inferRoot(fluidRepoName: FluidRepoName) {
    return lookUpDir(process.cwd(), async (curr) => {
        logVerbose(`InferRoot: probing ${curr}`);
        try {
            if (await isFluidRoot(curr, fluidRepoName)) {
                return true;
            }
        } catch {
        }
        return false;
    });
}

export async function getResolvedFluidRoot(fluidRepoName: FluidRepoName) {
    let checkFluidRoot = true;
    let root = commonOptions.root;
    if (root) {
        logVerbose(`Using argument root @ ${root}`);
    } else {
        root = await inferRoot(fluidRepoName);
        if (root) {
            checkFluidRoot = false;
            logVerbose(`Using inferred root @ ${root}`);
        } else if (commonOptions.defaultRoot) {
            root = commonOptions.defaultRoot;
            logVerbose(`Using default root @ ${root}`);
        } else {
            console.error(`ERROR: Unknown repo root. Specify it with --root or environment variable _FLUID_ROOT_`);
            process.exit(-101);
        }
    }

    if (checkFluidRoot && !isFluidRoot(root, fluidRepoName)) {
        console.error(`ERROR: '${root}' is not a root of fluid repo.`);
        process.exit(-100);
    }

    const resolvedRoot = path.resolve(root);
    if (!existsSync(resolvedRoot)) {
        console.error(`ERROR: Repo root '${resolvedRoot}' not exist.`);
        process.exit(-102);
    }

    // Use realpath.native to get the case-sensitive path on windows
    return await realpathAsync(resolvedRoot);
}
