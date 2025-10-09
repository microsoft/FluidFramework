/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * I am a test function with pretty standard docs, but all of my tags have hyphens after them :(
 * @remarks - Here are some remarks.
 * @deprecated- This function is deprecated, use something else.
 * @returns - The concatenated string.
 */
function invalid<T>(param1: string, param2: T): string {
	return `${param1} - ${param2}`;
}

/**
 * I am a test function with pretty standard docs, and none of my tags have hyphens after them :)
 * @remarks Here are some remarks.
 * @deprecated This function is deprecated, use something else.
 * @returns The concatenated string.
 * @param param1 - I am a param comment. Since my hyphen follows the param name, this is valid.
 * @typeParam T - I am a type param comment. I am also valid.
 */
function valid<T>(param1: string, param2: T): string {
	return `${param1} - ${param2}`;
}
