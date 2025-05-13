/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type TreeMapNode, type TreeArrayNode, NodeKind } from "@fluidframework/tree";

import type { ObjectPath } from "./sharedTreeDiff.js";

/**
 * Checks if the given object is an {@link TreeMapNode}.
 */
export function isTreeMapNode(obj: unknown): obj is TreeMapNode {
	if (typeof obj === "object" && obj !== null) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const maybeNodeKind: unknown = Object.getPrototypeOf(obj)?.constructor?.kind;
		return maybeNodeKind === NodeKind.Map;
	}
	return false;
}

/**
 * Checks if the given object is an {@link TreeArrayNode}.
 */
export function isTreeArrayNode(obj: unknown): obj is TreeArrayNode {
	if (typeof obj === "object" && obj !== null) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		const maybeNodeKind: unknown = Object.getPrototypeOf(obj)?.constructor?.kind;
		return maybeNodeKind === NodeKind.Array;
	}
	return false;
}

/**
 * Traverses the provided {@link ObjectPath} on the provided Shared Tree or JSON object and returns the value at the end of the path.
 *
 * @alpha
 */
export function sharedTreeTraverse<T = unknown>(
	jsonObject: TreeMapNode | TreeArrayNode | Record<string, unknown>,
	path: ObjectPath,
): T | undefined {
	let current: unknown = jsonObject;

	for (const key of path) {
		if (current === undefined || current === null) {
			return undefined;
		}

		current = isTreeMapNode(current) ? current.get(key as string) : current[key];
	}

	return current as T;
}
