/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface for objects that require lifetime management via explicit disposal.
 *
 * @deprecated Only exists because of {@link doIfNotDisposed} which is also deprecated and will be removed at some
 * point. Don't use this.
 *
 * @internal
 *
 * @privateremarks
 * This was copied here from common-definitions when we removed that package.
 * It only exists because of doIfNotDisposed.
 * When that function (unused in the repo) is removed, this should go away with it.
 */
export interface IDisposable {
	/**
	 * Whether or not the object has been disposed.
	 * If true, the object should be considered invalid, and its other state should be disregarded.
	 */
	readonly disposed: boolean;

	/**
	 * Dispose of the object and its resources.
	 * @param error - Optional error indicating the reason for the disposal, if the object was
	 * disposed as the result of an error.
	 */
	dispose(error?: Error): void;
}

/**
 * Returns a wrapper around the provided function, which will only invoke the inner function if the provided
 * {@link IDisposable | disposable} object has not yet been disposed.
 *
 * @throws Will throw an error if the item has already been disposed.
 *
 * @deprecated This function has no replacement.
 *
 * @privateremarks
 * This function is used in the container-loader package, so the implementation was moved there but it is no longer
 * exported.
 * @internal
 */
export function doIfNotDisposed<T>(
	disposable: IDisposable,
	f: (...args: any[]) => T,
): (...args: any[]) => T {
	return (...args: any[]): T => {
		if (disposable.disposed) {
			throw new Error("Already disposed");
		} else {
			return f(...args);
		}
	};
}
