/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Kind of container state change.
 *
 * @internal
 */
export enum ContainerStateChangeKind {
	/**
	 * Container is attached to the Fluid service.
	 */
	Attached = "attached",

	/**
	 * Container completes connecting to the Fluid service.
	 */
	Connected = "connected",

	/**
	 * Container becomes disconnected from the Fluid service.
	 */
	Disconnected = "disconnected",

	/**
	 * Container is disposed, which permanently disables it. Resources disposed.
	 */
	Disposed = "disposed",

	/**
	 * Container is closed. No new activity will occur, but resources might not been disposed yet.
	 */
	Closed = "closed",
}
