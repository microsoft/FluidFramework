/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@microsoft/fluid-runtime-definitions";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";

/**
 * Summarizable object interface
 */
export interface ISummarizableObject extends ISharedObject {
    /**
     * Retrieves the given key from the map.
     * @param key - Key to retrieve from.
     * @returns The stored value of type Jsonable, or undefined if the key is not set.
     */
    get(key: string): Jsonable;

    /**
     * Sets the value stored at key to the provided value.
     * @param key - Key to set at.
     * @param value - Jsonable type value to set.
     */
    set(key: string, value: Jsonable): void;
}
