/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    generateBumpVersionBranchName,
    generateBumpDepsBranchName,
    createBumpBranch,
    getDefaultBumpTypeForBranch,
    generateReleaseBranchName,
} from "./branches";
export {
    bumpPackageDependencies,
    bumpVersion as bumpReleaseGroup,
    PackageWithRangeSpec,
} from "./bump";
export {
    getAllVersions,
    getPreReleaseDependencies,
    generateReleaseGitTagName,
    getTagsForReleaseGroup,
    getVersionFromTag,
    isReleased,
    npmCheckUpdates,
    PreReleaseDependencies,
    sortVersions,
    VersionDetails,
} from "./package";
export { difference } from "./sets";

export function applyMixins(derivedCtor: any, constructors: any[]) {
    // eslint-disable-next-line unicorn/no-array-for-each
    constructors.forEach((baseCtor) => {
        // eslint-disable-next-line unicorn/no-array-for-each
        Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
            Object.defineProperty(
                derivedCtor.prototype,
                name,
                Object.getOwnPropertyDescriptor(baseCtor.prototype, name) || Object.create(null),
            );
        });
    });
}
