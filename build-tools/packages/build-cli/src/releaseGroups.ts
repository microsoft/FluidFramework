/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isMonoRepoKind, MonoRepoKind } from "@fluidframework/build-tools";

/**
 * A type that represents independent packages (as opposed to those that are part of a release group).
 *
 * @remarks
 *
 * This type is an alias for string now but it could become a real class/interface in the future. Right now it is the
 * full package name including scope.
 *
 * @internal
 */
export type ReleasePackage = string;

/**
 * An enum that represents known release groups.
 *
 * @internal
 */
export type ReleaseGroup = MonoRepoKind;

/**
 * A type guard used to determine if a string is a ReleaseGroup.
 *
 * @internal
 */
export function isReleaseGroup(str: string | undefined): str is ReleaseGroup {
    return isMonoRepoKind(str);
}
