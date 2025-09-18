/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert } from "@fluidframework/core-utils/internal";
import type { FlexTreeNode } from "./flexTreeTypes.js";
import type { FieldKey } from "../../core/index.js";

/*
 * This file sets up a static observation tracking system.
 *
 * This library used to contain a more general variant of this which was deleted in https://github.com/microsoft/FluidFramework/pull/18659.
 * This pattern somewhat resembles the approach in https://github.com/tc39/proposal-signals.
 */

/**
 * An object informed about observation made to trees.
 * @remarks
 * See {@link withObservation} and {@link currentObserver}.
 */
export interface Observer {
	observeNodeFields(node: FlexTreeNode): void;
	observeNodeField(node: FlexTreeNode, key: FieldKey): void;
	observeParentOf(node: FlexTreeNode): void;
}
/**
 * The current observer, if any.
 * @remarks
 * Set via {@link setObserver} as used by {@link withObservation}.
 */
export let currentObserver: Observer | undefined;

const observerStack: (Observer | undefined)[] = [];

function setObserver(newObserver: Observer | undefined): void {
	observerStack.push(newObserver);
	currentObserver = newObserver;
}

function clearObserver(): void {
	debugAssert(() => observerStack.length > 0 || "Empty Observer stack on clear");
	const popped = observerStack.pop();
	debugAssert(() => popped === currentObserver || "Mismatched observer stack");
	currentObserver = observerStack[observerStack.length - 1];
}

/**
 * For the duration of `f`, pushes `newObserver` onto the observer stack, making it the {@link currentObserver}.
 */
export function withObservation<T>(newObserver: Observer | undefined, f: () => T): T {
	setObserver(newObserver);
	try {
		return f();
	} finally {
		clearObserver();
	}
}
