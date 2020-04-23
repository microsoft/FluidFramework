/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as registerDebug from "debug";
import { pkgName, pkgVersion } from "./packageVersion";

export const debug = registerDebug("fluid:consensus-register-collection");
debug(`Package: ${pkgName} - Version: ${pkgVersion}`);

export function strongAssert(value: unknown): asserts value {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!value) { assert(value); }
}

export function unreachableCase(value: never): never {
    throw new Error(`Unreachable Case: Type of ${value} is never`);
}
