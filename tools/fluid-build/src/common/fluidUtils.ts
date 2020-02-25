/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonOptions } from "./commonOptions";
import { existsSync, readFileAsync, realpathAsync } from "./utils";
import * as path from "path";
import { logVerbose } from "./logging";

async function isFluidRootLerna(dir: string) {
    const filename = path.join(dir, "lerna.json");
    if (!existsSync(filename)) {
        return false;
    }

    const content = await readFileAsync(filename, "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.packages)
        && parsed.packages.length == 2
        && parsed.packages[0] === "packages/**"
        && parsed.packages[1] === "examples/components/**") {
        return true;
    }
    return false;
}

async function isFluidRootPackage(dir: string) {
    const filename = path.join(dir, "package.json");
    if (!existsSync(filename)) {
        return false;
    }

    const content = await readFileAsync(filename, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.name === "root" && parsed.private === true) {
        return true;
    }
    return false;
}

async function isFluidRoot(dir: string) {
    return await isFluidRootLerna(dir) && await isFluidRootPackage(dir);
}

async function inferRoot() {
    let curr = process.cwd();
    while (true) {
        try {
            if (await isFluidRoot(curr)) {
                return curr;
            }
        } catch {
        }

        const up = path.resolve(curr, "..");
        if (up === curr) {
            break;
        }
        curr = up;
    }
    return undefined;
}

export async function getResolvedFluidRoot() {
    let checkFluidRoot = true;
    let root = commonOptions.root;
    if (root) {
        logVerbose(`Using argument root @ ${root}`);
    } else {
        root = await inferRoot();
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

    if (checkFluidRoot && !isFluidRoot(root)) {
        console.error(`ERROR: '${root}' is not a root of fluid repo.`);
        process.exit(-100);
    }

    const resolvedRoot = path.resolve(root);
    if (!existsSync(resolvedRoot)) {
        console.error(`ERROR: Repo root '${resolvedRoot}' not exist.`);
        process.exit(-102);
    }

    // Use realpath.native to get the case-sensitive path
    return await realpathAsync(resolvedRoot);
}