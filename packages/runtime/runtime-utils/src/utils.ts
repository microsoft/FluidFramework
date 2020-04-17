/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISerializedHandle } from "@microsoft/fluid-component-core-interfaces";

export const isSerializedHandle = (value: any): value is ISerializedHandle =>
    value?.type === "__fluid_handle__";
