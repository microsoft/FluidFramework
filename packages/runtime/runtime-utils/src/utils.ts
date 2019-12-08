/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@microsoft/fluid-component-core-interfaces";

export function isSerializedHandle(value: any): value is ISerializedHandle {
    // tslint:disable-next-line:no-unsafe-any
    return value && value.type === "__fluid_handle__";
}
