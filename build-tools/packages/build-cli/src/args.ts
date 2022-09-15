/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { type Arg } from "@oclif/core/lib/interfaces";
import { isReleaseGroup, ReleaseGroup, ReleasePackage } from "./releaseGroups";

export const packageOrReleaseGroupArg: Arg = {
    name: "package_or_release_group",
    required: true,
    description:
        "The name of a package or a release group. Dependencies on these packages will be bumped.",
};

// export function parsePackageOrReleaseGroupArg(packageOrReleaseGroup: string): {
//     pkg?: ReleasePackage;
//     releaseGroup?: ReleaseGroup;
// } {
//     let pkg: ReleasePackage | undefined;
//     let releaseGroup: ReleaseGroup | undefined;

//     if (isReleaseGroup(packageOrReleaseGroup)) {
//         releaseGroup = packageOrReleaseGroup;
//     } else {
//         pkg = packageOrReleaseGroup;
//     }

//     return {
//         pkg,
//         releaseGroup,
//     };
// }
