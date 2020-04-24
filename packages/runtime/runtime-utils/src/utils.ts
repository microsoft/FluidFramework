/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ISerializedHandle } from "@microsoft/fluid-component-core-interfaces";

export const isSerializedHandle = (value: any): value is ISerializedHandle =>
    value?.type === "__fluid_handle__";

export const strongAssert: (value: any, message?: string | Error | undefined) => asserts value = assert;

export function unreachableCase(value: never): never {
    throw new Error(`Unreachable Case: Type of ${value} is never`);
}
