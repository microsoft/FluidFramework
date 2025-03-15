/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Like `JSON.stringify`, but returns a clone instead of stringifying the result.
 *
 * Only considers enumerable own properties with string keys.
 *
 * @param root - Data to clone.
 * @param rootKey - the key to pass to replacer for the root.
 * @param replacer - Like `JSON.stringify`'s replacer: called for every value while walking data. Unlike `JSON.stringify`'s replacer
 * returns a wrapper around the value, with a "clone" flag to indicate of the clone should recurse into that object (true) or use it as is (false).
 * @returns A clone of `root`.
 * @alpha
 */
export function cloneWithReplacements(
	root: unknown,
	rootKey: string,
	replacer: (key: string, value: unknown) => { clone: boolean; value: unknown },
): unknown {
	const { clone, value } = replacer(rootKey, root);
	if (clone === false) {
		return value;
	}

	if (root === null || typeof root !== "object") {
		return root;
	}

	if (Array.isArray(root)) {
		return root.map((item, index) => cloneWithReplacements(item, index.toString(), replacer));
	}

	const result: Record<string, unknown> = {};
	for (const [key, field] of Object.entries(root)) {
		result[key] = cloneWithReplacements(field, key, replacer);
	}
	return result;
}
