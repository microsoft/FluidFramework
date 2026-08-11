/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This function can be used to assert at compile time that a given value has type never.
 * One common usage is in the default case of a switch block,
 * to ensure that all cases are explicitly handled.
 *
 * Example:
 * ```typescript
 * const bool: true | false = ...;
 * switch(bool) {
 *   case true: {...}
 *   case false: {...}
 *   default: unreachableCase(bool);
 * }
 * ```
 * @internal
 */
export function unreachableCase(_: never, message = "Unreachable Case"): never {
	throw new Error(message);
}
