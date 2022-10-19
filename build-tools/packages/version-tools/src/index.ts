/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    isVersionBumpType,
    isVersionBumpTypeExtended,
    ReleaseVersion,
    VersionBumpType,
    VersionBumpTypeExtended,
    VersionChangeType,
    VersionChangeTypeExtended,
} from "./bumpTypes";
export {
    changePreReleaseIdentifier,
    getVersionRange,
    fromInternalScheme,
    isInternalVersionScheme,
    toInternalScheme,
} from "./internalVersionScheme";
export {
    bumpVersionScheme,
    detectVersionScheme,
    getLatestReleaseFromList,
    isVersionScheme,
    sortVersions,
    VersionScheme,
} from "./schemes";
export { bumpRange, detectBumpType, isPrereleaseVersion } from "./semver";
export { fromVirtualPatchScheme, toVirtualPatchScheme } from "./virtualPatchScheme";
