/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface for objects that require lifetime management via explicit disposal.
 * @public
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
