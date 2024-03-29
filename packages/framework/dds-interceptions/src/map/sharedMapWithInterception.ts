/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ISharedMap } from "@fluidframework/map";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";

/**
 * - Create a new object from the passed SharedMap.
 *
 * - Modify the set method to call the setInterceptionCallback before calling set on the underlying SharedMap.
 *
 * - The setInterceptionCallback and the call to the underlying SharedMap are wrapped around an
 * orderSequentially call to batch any operations that might happen in the callback.
 *
 * @param sharedMap - The underlying SharedMap
 * @param context - The IFluidDataStoreContext that will be used to call orderSequentially
 * @param setInterceptionCallback - The interception callback to be called
 *
 * @returns A new SharedMap that intercepts the set method and calls the setInterceptionCallback.
 * @internal
 */
export function createSharedMapWithInterception(
	sharedMap: ISharedMap,
	context: IFluidDataStoreContext,
	setInterceptionCallback: (sharedMap: ISharedMap, key: string, value: any) => void,
): ISharedMap {
	const sharedMapWithInterception = Object.create(sharedMap);

	// executingCallback keeps track of whether set is called recursively from the setInterceptionCallback.
	let executingCallback: boolean = false;

	sharedMapWithInterception.set = (key: string, value: any) => {
		let map;
		// Set should not be called on the wrapped object from the interception callback as this will lead to
		// infinite recursion.
		assert(
			executingCallback === false,
			0x0c0 /* "set called recursively from the interception callback" */,
		);

		context.containerRuntime.orderSequentially(() => {
			map = sharedMap.set(key, value);
			executingCallback = true;
			try {
				setInterceptionCallback(sharedMap, key, value);
			} finally {
				executingCallback = false;
			}
		});
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return map;
	};

	return sharedMapWithInterception as ISharedMap;
}
