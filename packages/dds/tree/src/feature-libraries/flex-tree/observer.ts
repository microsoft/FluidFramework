/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import type { FlexTreeNode } from "./flexTreeTypes.js";

export interface Observer {
	observeNodeContent(node: FlexTreeNode): void;
	observeParentOf(node: FlexTreeNode): void;
}
/**
 * The current observer, if any.
 * @remarks
 * Set via {@link setObserver} as used by {@link withObservation}.
 */

export let currentObserver: Observer | undefined;
const observerStack: Observer[] = [];
function setObserver(newObserver: Observer): void {
	observerStack.push(newObserver);
	currentObserver = newObserver;
}
function clearObserver(): void {
	debugAssert(() => observerStack.length > 0 || "Empty Observer stack on clear");
	const popped = observerStack.pop();
	debugAssert(() => popped === currentObserver || "Mismatched observer stack");
	currentObserver = observerStack[observerStack.length - 1];
}

export function withObservation<T>(newObserver: Observer, f: () => T): T {
	setObserver(newObserver);
	try {
		return f();
	} finally {
		clearObserver();
	}
}
