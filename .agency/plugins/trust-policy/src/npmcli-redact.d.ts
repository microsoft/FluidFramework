/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @npmcli/redact ships no type declarations, and DefinitelyTyped has none.
declare module "@npmcli/redact" {
	/**
	 * Masks URL passwords, npm access tokens, and UUIDs in a string, as npm does in its logs.
	 */
	export function redact(value: string): string;
}
