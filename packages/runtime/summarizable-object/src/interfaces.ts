/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Jsonable,
    JsonableObject,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";

export type SummarizableData = JsonableObject<Jsonable> | undefined;

/**
 * Summarizable object interface
 */
export interface ISummarizableObject extends ISharedObject {
    readonly data: SummarizableData;

    /**
     * Set data on the object in response to a remote op.
     *
     * @param data The data to be set.
     * @param sequenceNumber The sequence number of the remote op in response to which this is called.
     */
    set(data: SummarizableData, sequenceNumber: number): void;
}
