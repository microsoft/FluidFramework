/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Base interface for event emitters.
 */
export interface IEvent {
	/**
	 * Base event emitter signature.
	 *
	 * @remarks The event emitter polyfill and the node event emitter have different event types:
	 * `string | symbol` vs. `string | number`.
	 *
	 * So for our typing we'll contrain to string, that way we work with both.
	 *
	 * @eventProperty
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(event: string, listener: (...args: any[]) => void);
}
