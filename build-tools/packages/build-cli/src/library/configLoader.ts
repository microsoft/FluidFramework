/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Loader for .mjs (ESM) config files.
 * Required for cosmiconfig v9+ which removed default .mjs support.
 *
 * @param filepath - The path to the .mjs file to load
 * @returns The default export from the module
 */
export async function mjsLoader(filepath: string): Promise<unknown> {
	const module = await import(filepath);
	return module.default;
}
