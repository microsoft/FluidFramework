/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Off } from "@fluidframework/core-interfaces/internal";

import type { TreeNode } from "./treeNode.js";

const hydrationListeners = new WeakMap<TreeNode, Set<() => void>>();

/**
 * Adds a listener for the hydration of a tree node.
 *
 * @remarks
 * The listener runs one time.
 */
export function onTreeNodeHydrated(node: TreeNode, listener: () => void): Off {
	let listeners = hydrationListeners.get(node);
	if (listeners === undefined) {
		listeners = new Set();
		hydrationListeners.set(node, listeners);
	}
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && hydrationListeners.get(node) === listeners) {
			hydrationListeners.delete(node);
		}
	};
}

/**
 * Runs the listeners after a tree node completes hydration.
 *
 * @remarks
 * An error from one listener does not stop the other listeners.
 * If listeners throw errors, this function throws the first error.
 */
export function notifyTreeNodeHydrated(node: TreeNode): void {
	const listeners = hydrationListeners.get(node);
	if (listeners === undefined) {
		return;
	}
	hydrationListeners.delete(node);
	let firstError: unknown;
	for (const listener of listeners) {
		try {
			listener();
		} catch (error) {
			firstError ??= error;
		}
	}
	if (firstError instanceof Error) {
		throw firstError;
	}
	if (firstError !== undefined) {
		throw new Error("Hydration listener threw a non-Error value", { cause: firstError });
	}
}
