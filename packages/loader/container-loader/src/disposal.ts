/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/core-interfaces";

/**
 * Returns a wrapper around the provided function, which will only invoke the inner function if the provided
 * {@link @fluidframework/core-interfaces#IDisposable | disposable} object has not yet been disposed.
 *
 * @throws Will throw an error if the item has already been disposed.
 */
export function doIfNotDisposed<T>(
	disposable: IDisposable,
	f: (...args: unknown[]) => T,
): (...args: unknown[]) => T {
	return (...args: unknown[]): T => {
		if (disposable.disposed) {
			throw new Error("Already disposed");
		} else {
			return f(...args);
		}
	};
}
