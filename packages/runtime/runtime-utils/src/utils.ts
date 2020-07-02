/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@fluidframework/component-core-interfaces";

export const isSerializedHandle = (value: any): value is ISerializedHandle =>
    value?.type === "__fluid_handle__";

export function unreachableCase(value: never): never {
    throw new Error(`Unreachable Case: Type of ${value} is never`);
}
