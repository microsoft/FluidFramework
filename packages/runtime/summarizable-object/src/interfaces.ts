/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@microsoft/fluid-runtime-definitions";
import { ISharedObject } from "@microsoft/fluid-shared-object-base";

/**
 * Summarizable object interface. A summarizable object is part of the summary but it does not generate any ops.
 * The set on this interface must only be called in response to a remote op. Basically, if we replay same ops,
 * the set of calls on this interface to set data should be the same. This is critical because the object does not
 * generate ops of its own, but relies on the above principle to maintain eventual consistency and to summarize.
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
