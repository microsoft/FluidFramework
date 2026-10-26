/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/core-utils/internal';

import type { ISharedTree } from './ISharedTree.js';
import type { SequencedEditAppliedHandler } from './SharedTree.js';
import type { ChangeInternal, EditLogSummary, FluidEditHandle } from './persisted-types/index.js';

/**
 * Operations that package helpers need but applications must not use.
 */
export interface SharedTreeInternalCapabilities {
	emitError(error: unknown): void;
	getEditLogSummary(): EditLogSummary<ChangeInternal, FluidEditHandle>;
	// The public event interface retains its historical name, not the runtime event name.
	onSequencedEditApplied(listener: SequencedEditAppliedHandler): void;
	offSequencedEditApplied(listener: SequencedEditAppliedHandler): void;
}

const treeInternals = new WeakMap<ISharedTree, SharedTreeInternalCapabilities>();

/**
 * Registers the private operations for a tree instance.
 */
export function registerSharedTreeInternals(tree: ISharedTree, capabilities: SharedTreeInternalCapabilities): void {
	assert(!treeInternals.has(tree), 'SharedTree internal capabilities are already registered');
	treeInternals.set(tree, capabilities);
}

/**
 * Gets the private operations for a tree that this package created.
 */
export function getSharedTreeInternals(tree: ISharedTree): SharedTreeInternalCapabilities {
	const capabilities = treeInternals.get(tree);
	assert(capabilities !== undefined, 'SharedTree internal capabilities are not registered');
	return capabilities;
}
