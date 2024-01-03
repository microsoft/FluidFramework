/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";

/**
 * Shared summary block interface. A shared summary block is part of the summary but it does not generate any ops.
 * The set on this interface must only be called in response to a remote op. Basically, if we replay same ops,
 * the set of calls on this interface to set data should be the same. This is critical because the object does not
 * generate ops of its own, but relies on the above principle to maintain eventual consistency and to summarize.
 * @alpha
 */
export interface ISharedSummaryBlock extends ISharedObject {
	/**
	 * Retrieves the given key from the map.
	 * @param key - Key to retrieve from.
	 * @returns The stored value, or undefined if the key is not set.
	 *
	 * @privateRemarks
	 * The return type is underspecified to allow for the possibility of objects with function or undefined values.
	 */
	get<T>(key: string): Jsonable<T>;

	/**
	 * Sets the value stored at key to the provided value.
	 * @param key - Key to set at.
	 * @param value - Jsonable type value to set.
	 */
	set<T>(key: string, value: Jsonable<T>): void;
}
