/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Jsonable,
    JsonableObject,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";

export type SummarizableData = JsonableObject<Jsonable>;

/**
 * Summarizable object interface
 */
export interface ISummarizableObject extends ISharedObject {
    data: SummarizableData;
}
