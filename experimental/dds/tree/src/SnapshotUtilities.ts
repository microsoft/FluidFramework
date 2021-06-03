/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { compareArrays, copyPropertyIfDefined, memoizeGetter } from './Common';
import { NodeId, TraitLabel } from './Identifiers';
import { ChangeNode, Payload, TraitMap } from './generic';
import { Snapshot, SnapshotNode } from './Snapshot';

/**
 * @returns true if two `Payloads` are identical.
 * May return false for equivalent payloads encoded differently.
 *
 * Object field order and object identity are not considered significant, and are ignored by this function.
 * (This is because they may not be preserved through roundtrip).
 *
 * For other information which Fluid would lose on serialization round trip,
 * behavior is unspecified other than this this function is reflective (all payloads are equal to themselves)
 * and commutative (argument order does not matter).
 *
 * This means that any Payload is equal to itself and a deep clone of itself.
 *
 * Payloads might not be equal to a version of themselves that has been serialized then deserialized.
 * If they are serialized then deserialized again, the two deserialized objects will compare equal,
 * however the serialized strings may be unequal (due to field order for objects being unspecified).
 *
 * Fluid will cause lossy operations due to use of JSON.stringify().
 * This includes:
 * - Loss of object identity
 * - Loss of field order (may be ordered arbitrarily)
 * - -0 becomes +0
 * - NaN, Infinity, -Infinity all become null
 * - custom toJSON functions may cause arbitrary behavior
 * - functions become undefined or null
 * - non enumerable properties (including prototype) are lost
 * - more (this is not a complete list)
 *
 * Inputs must not contain cyclic references other than fields set to their immediate parent (for the JavaScript feature detection pattern).
 *
 * IFluidHandle instances (detected via JavaScript feature detection pattern) are only compared by absolutePath.
 *
 * TODO:#54095: Is there a better way to do this comparison?
 * @public
 */
export function comparePayloads(a: Payload, b: Payload): boolean {
	// === is not reflective because of how NaN is handled, so use Object.is instead.
	// This treats -0 and +0 as different.
	// Since -0 is not preserved in serialization round trips,
	// it can be handed in any way that is reflective and commutative, so this is fine.
	if (Object.is(a, b)) {
		return true;
	}

	// Primitives which are equal would have early returned above, so now if the values are not both objects, they are unequal.
	if (typeof a !== 'object' || typeof b !== 'object') {
		return false;
	}

	// null is of type object, and needs to be treated as distinct from the empty object.
	// Handling it early also avoids type errors trying to access its keys.
	// Rationale: 'undefined' payloads are reserved for future use (see 'SetValue' interface).
	// eslint-disable-next-line no-null/no-null
	if (a === null || b === null) {
		return false;
	}

	// Special case IFluidHandles, comparing them only by their absolutePath
	// Detect them using JavaScript feature detection pattern: they have a `IFluidHandle` field that is set to the parent object.
	{
		const aHandle = a as IFluidHandle;
		const bHandle = b as IFluidHandle;
		if (aHandle.IFluidHandle === a) {
			if (bHandle.IFluidHandle !== b) {
				return false;
			}
			return a.absolutePath === b.absolutePath;
		}
	}

	// Fluid Serialization (like Json) only keeps enumerable properties, so we can ignore non-enumerable ones.
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	// make sure objects with numeric keys (or no keys) compare unequal to arrays.
	if (Array.isArray(a) !== Array.isArray(b)) {
		return false;
	}

	// Fluid Serialization (like Json) orders object fields arbitrarily, so reordering fields is not considered considered a change.
	// Therefor the keys arrays must be sorted here.
	if (!Array.isArray(a)) {
		aKeys.sort();
		bKeys.sort();
	}

	// First check keys are equal.
	// This will often early exit, and thus is worth doing as a separate pass than recursive check.
	if (!compareArrays(aKeys, bKeys)) {
		return false;
	}

	for (let i = 0; i < aKeys.length; i++) {
		const aItem: Payload = a[aKeys[i]];
		const bItem: Payload = b[bKeys[i]];

		// The JavaScript feature detection pattern, used for IFluidHandle, uses a field that is set to the parent object.
		// Detect this pattern and special case it to avoid infinite recursion.
		const aSelf = Object.is(aItem, a);
		const bSelf = Object.is(bItem, b);
		if (aSelf !== bSelf) {
			return false;
		}
		if (!aSelf) {
			if (!comparePayloads(aItem, bItem)) {
				return false;
			}
		}
	}

	return true;
}

/**
 * @returns true iff two `SnapshotNodes` are equivalent.
 * May return false for nodes they contain equivalent payloads encoded differently.
 */
export function compareSnapshotNodes(nodeA: SnapshotNode, nodeB: SnapshotNode): boolean {
	if (nodeA === nodeB) {
		return true;
	}

	if (nodeA.identifier !== nodeB.identifier) {
		return false;
	}

	if (nodeA.definition !== nodeB.definition) {
		return false;
	}

	if (!comparePayloads(nodeA.payload, nodeB.payload)) {
		return false;
	}

	if (nodeA.traits.size !== nodeB.traits.size) {
		return false;
	}

	for (const traitA of nodeA.traits) {
		const [traitLabelA, nodeSequenceA] = traitA;
		const nodeSequenceB = nodeB.traits.get(traitLabelA);
		if (!nodeSequenceB) {
			return false;
		}

		if (nodeSequenceA.length !== nodeSequenceB.length) {
			return false;
		}

		for (let i = 0; i < nodeSequenceA.length; i++) {
			if (nodeSequenceA[i] !== nodeSequenceB[i]) {
				return false;
			}
		}
	}

	return true;
}

/**
 * Converts a node in a snapshot to an equivalent `ChangeNode`.
 * @param snapshot - the snapshot in which the node exists
 * @param nodeId - the id of the node in the snapshot
 * @param lazyTraits - whether or not traits should be populated lazily.
 * If lazy, the subtrees under each trait will not be read until the trait is first accessed.
 */
export function getChangeNodeFromSnapshot(snapshot: Snapshot, nodeId: NodeId, lazyTraits = false): ChangeNode {
	const node = snapshot.getSnapshotNode(nodeId);
	const nodeData = {
		definition: node.definition,
		identifier: node.identifier,
	};
	copyPropertyIfDefined(node, nodeData, 'payload');

	if (lazyTraits) {
		return {
			...nodeData,
			get traits() {
				return memoizeGetter(this, 'traits', makeTraits(snapshot, node.traits, lazyTraits));
			},
		};
	}

	return {
		...nodeData,
		traits: makeTraits(snapshot, node.traits, lazyTraits),
	};
}

/** Given the traits of a SnapshotNode, return the corresponding traits on a Node */
function makeTraits(
	snapshot: Snapshot,
	traits: ReadonlyMap<TraitLabel, readonly NodeId[]>,
	lazyTraits = false
): TraitMap<ChangeNode> {
	const traitMap = {};
	for (const [label, trait] of traits.entries()) {
		if (lazyTraits) {
			Object.defineProperty(traitMap, label, {
				get() {
					const treeNodeTrait = trait.map((nodeId) =>
						getChangeNodeFromSnapshot(snapshot, nodeId, lazyTraits)
					);
					return memoizeGetter(this as TraitMap<ChangeNode>, label, treeNodeTrait);
				},
				configurable: true,
				enumerable: true,
			});
		} else {
			Object.defineProperty(traitMap, label, {
				value: trait.map((nodeId) => getChangeNodeFromSnapshot(snapshot, nodeId, lazyTraits)),
				enumerable: true,
			});
		}
	}

	return traitMap;
}

/**
 * Compares finite numbers to form a strict partial ordering.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 *
 * Once https://github.com/qwertie/btree-typescript/pull/15 is merged, we can use the version of this function from it.
 */
export function compareFiniteNumbers(a: number, b: number): number {
	return a - b;
}
