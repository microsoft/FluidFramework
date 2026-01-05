/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * I am a test function with pretty standard docs, but all of my tags have hyphens after them :(
 * @remarks - Here are some remarks.
 * @deprecated -  This function is deprecated, use something else.
 * @returns  -	The concatenated string.
 */
function invalid<T>(param1: string, param2: T): string {
	return `${param1} - ${param2}`;
}

/**
 * I am a test function with pretty standard docs, and none of my tags have hyphens after them :)
 * \@tag - Escaped tags should be valid since the @ is escaped.
 * `@tag - in a code block` - This should also be valid.
 * I also have a {@link @foo/bar | link} - This should not trigger the rule.
 * @remarks Here are some remarks.
 * @deprecated This function is deprecated, use something else.
 * @returns The concatenated string.
 * @param param1 - I am a param comment. Since my hyphen follows the param name, this is valid.
 * @typeParam T - I am a type param comment. I am also valid.
 * @example
 * An example that should be valid:
 * ```
 * @foo - Bar (this should be ignored by the rule, since it occurs within a fenced code block and therefore cannot be an actual tag)
 * ```
 */
function valid<T>(param1: string, param2: T): string {
	return `${param1} - ${param2}`;
}
