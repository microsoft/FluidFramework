/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isMonoRepoKind, MonoRepoKind } from "@fluidframework/build-tools";

export type ReleasePackage = string;

export type ReleaseGroup = MonoRepoKind;

// eslint-disable-next-line valid-jsdoc
/** A type guard used to determine if a string is a ReleaseGroup. */
export function isReleaseGroup(str: string | undefined): str is ReleaseGroup {
    return isMonoRepoKind(str);
}
