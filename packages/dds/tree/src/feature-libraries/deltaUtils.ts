/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ChangeAtomId,
	type DeltaDetachedNodeId,
	type DeltaRoot,
	makeDetachedNodeId,
} from "../core/index.js";
import type { Mutable } from "../util/index.js";

export function nodeIdFromChangeAtom(changeAtom: ChangeAtomId): DeltaDetachedNodeId {
	return makeDetachedNodeId(changeAtom.revision, changeAtom.localId);
}

/**
 * Converts a `Delta.Root` whose tree content is represented with by `TIn` instances
 * into a `Delta.Root`whose tree content is represented with by `TOut` instances.
 *
 * This function is useful for converting `Delta`s that represent tree content with cursors
 * into `Delta`s that represent tree content with a deep-comparable representation of the content.
 * See {@link assertDeltaEqual}.
 * @param root - The delta to convert. Not mutated.
 * @param func - The functions used to map tree content.
 */
export function mapRootChanges<TIn, TOut>(
	root: DeltaRoot<TIn>,
	func: (tree: TIn) => TOut,
): DeltaRoot<TOut> {
	const out: Mutable<DeltaRoot<TOut>> = {};
	if (root.fields !== undefined) {
		out.fields = root.fields;
	}
	if (root.build !== undefined) {
		out.build = root.build.map(({ id, trees }) => ({
			id,
			trees: trees.map(func),
		}));
	}
	if (root.global !== undefined) {
		out.global = root.global.map(({ id, fields }) => ({
			id,
			fields,
		}));
	}
	if (root.rename !== undefined) {
		out.rename = root.rename.map(({ count, oldId, newId }) => ({
			count,
			oldId,
			newId,
		}));
	}
	return out;
}
