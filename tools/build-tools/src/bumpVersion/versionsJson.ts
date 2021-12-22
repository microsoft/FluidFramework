/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";
import { getResolvedFluidRoot } from "../common/fluidUtils";
import { Context } from "./context";
import { GitRepo } from "./utils";

interface IGroupItem {
    version: string,
    members: string[],
}

interface IPackageItem {
    version: string,
    group: string | undefined,
}

interface IVersionsJson {
    [branchName: string]: {
        groups: {
            [groupName: string]: IGroupItem,
        },
        packages: {
            [packageName: string]: IPackageItem,
        }
    };
};

function createSortedObject<T>(obj: Record<string, T>): Record<string, T> {
    const sortedKeys = Object.keys(obj).sort();
    const sortedObject: Record<string, T> = {};

    // special case main so it's always at the top of the list
    sortedObject["main"] = undefined as any;
    for (const key of sortedKeys) {
        sortedObject[key] = obj[key];
    }
    if (sortedObject["main"] === undefined) {
        delete sortedObject["main"];
    }

    return sortedObject;
}

function readVersionsJson(jsonPath: string): IVersionsJson {
    if (!fs.existsSync(jsonPath)) {
        return { main: { groups: {}, packages: {} } };
    }

    const versionsJson: IVersionsJson = JSON.parse(fs.readFileSync(jsonPath).toString());
    return versionsJson;
}

function writeVersionsJson(jsonPath: string, versionsJson: IVersionsJson) {
    fs.writeFileSync(jsonPath, JSON.stringify(versionsJson, undefined, 4));
}

/**
 * Updates the versions json file entry for the specified branch name with the current version info
 * of the repo.  Can be used to update info for the current branch or to add an entry for a new
 * branch off the current branch.
 * @param branch The branch name to update in the versions json file.
 *      Defaults to the current branch name.
 */
export async function updateBranchVersions(branch?: string) {
    const resolvedRoot = await getResolvedFluidRoot();
    const repo = new GitRepo(resolvedRoot);
    const currentBranch = await repo.getCurrentBranchName();
    const versionsBranch = branch ?? currentBranch;
    const context = new Context(repo, "github.com/microsoft/FluidFramework", versionsBranch);

    const packageInfo: { [packageName: string]: IPackageItem } = {};
    const groupInfo: { [groupName: string]: IGroupItem } = {};
    for (const pkg of context.repo.packages.packages) {
        packageInfo[pkg.name] = { version: pkg.version, group: pkg.group };
        if (pkg.group !== undefined) {
            if (groupInfo[pkg.group] === undefined) {
                groupInfo[pkg.group] = { version: pkg.version, members: [] };
            }
            groupInfo[pkg.group].members.push(pkg.name);
            if (groupInfo[pkg.group].version !== pkg.version &&
                // certain groups have divergent versions
                // TODO: clean up these groups
                !["build", "tools"].includes(pkg.group)) {
                throw new Error(`Version for pkg ${pkg.name} does not match that of its group ${pkg.group}`);
            }
        }
    }

    for (const group of Object.keys(groupInfo)){
        groupInfo[group].members.sort();
    }

    const versionsJsonPath = path.join(resolvedRoot, "versions.json");
    const versionsJson = readVersionsJson(versionsJsonPath);
    if (versionsJson[versionsBranch] !== undefined && versionsBranch !== currentBranch) {
        console.warn(
            `WARNING: Overwrite info for branch ${versionsBranch} with info from branch ${currentBranch}. `,
            `This should usually only be done when creating a new versions json branch entry`,
        );
    }

    versionsJson[versionsBranch] = {
        groups: createSortedObject(groupInfo),
        packages: createSortedObject(packageInfo),
    }
    writeVersionsJson(versionsJsonPath, versionsJson);
}

updateBranchVersions().catch(e => console.log(e));
