/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type AnchorNode,
	type DetachedField,
	anchorSlot,
	getDetachedFieldContainingPath,
	rootField,
	type SchemaAndPolicy,
} from "../../core/index.js";

import { TreeStatus, type FlexTreeEntity } from "./flexTreeTypes.js";
/**
 * Checks the detached field and returns the TreeStatus based on whether or not the detached field is a root field.
 * @param detachedField - the detached field you want to check.
 * @returns the {@link TreeStatus} from the detached field provided.
 */
export function treeStatusFromDetachedField(detachedField: DetachedField): TreeStatus {
	return detachedField === rootField ? TreeStatus.InDocument : TreeStatus.Removed;
}

/**
 * Determines the tree status based on the anchor cache.
 *
 * Checks the anchorNode's cache to get the tree status.
 * If the cache is undefined or stale, it is updated and the treeStatus based on its detachedField is returned.
 *
 * @param anchors - the {@link AnchorSet} to compare your anchorNode cache to.
 * @param anchorNode - the {@link AnchorNode} to get the {@link TreeStatus} of.
 * @returns - the {@link TreeStatus} of the anchorNode provided.
 */
export function treeStatusFromAnchorCache(anchorNode: AnchorNode): TreeStatus {
	const cache = anchorNode.slots.get(detachedFieldSlot);
	const { generationNumber } = anchorNode.anchorSet;
	if (cache === undefined) {
		// If the cache is undefined, set the cache and return the treeStatus based on the detached field.
		return treeStatusFromDetachedField(
			getCachedUpdatedDetachedField(anchorNode, generationNumber),
		);
	} else {
		// If the cache is up to date, return the treeStatus based on the cached detached field.
		if (cache.generationNumber === generationNumber) {
			return treeStatusFromDetachedField(cache.detachedField);
		}
		// If the cache is not up to date, update the cache and return the treeStatus based on the updated detached field.
		return treeStatusFromDetachedField(
			getCachedUpdatedDetachedField(anchorNode, generationNumber),
		);
	}
}

/**
 * Updates the anchorNode cache with the provided generation number, and returns its detachedField.
 */
function getCachedUpdatedDetachedField(
	anchorNode: AnchorNode,
	generationNumber: number,
): DetachedField {
	const detachedField = getDetachedFieldContainingPath(anchorNode);
	anchorNode.slots.set(detachedFieldSlot, {
		generationNumber,
		detachedField,
	});
	return detachedField;
}

export const detachedFieldSlot = anchorSlot<DetachedFieldCache>();

export interface DetachedFieldCache {
	generationNumber: number;
	detachedField: DetachedField;
}

/**
 * Utility function to get a {@link SchemaAndPolicy} object from a {@link FlexTreeNode} or {@link FlexTreeField}.
 * @param nodeOrField - {@link FlexTreeNode} or {@link FlexTreeField} to get the schema and policy from.
 * @returns A {@link SchemaAndPolicy} object with the stored schema and policy from the node or field provided.
 * For {@link Unhydrated} nodes this schema may only describe the types allowed subtree for this particular entity.
 */
export function getSchemaAndPolicy(nodeOrField: FlexTreeEntity): SchemaAndPolicy {
	return {
		schema: nodeOrField.context.schema,
		policy: nodeOrField.context.schemaPolicy,
	};
}

/**
 * Indexing for {@link FlexTreeField.boxedAt} and {@link FlexTreeSequenceField.at} supports the
 * usage of negative indices, which regular indexing using `[` and `]` does not.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/at
 * for additional context on the semantics.
 *
 * @returns A positive index that can be used in regular indexing. Returns
 * undefined if that index would be out-of-bounds.
 */
export function indexForAt(index: number, length: number): number | undefined {
	let finalIndex = Math.trunc(+index);
	if (Number.isNaN(finalIndex)) {
		finalIndex = 0;
	}
	if (finalIndex < -length || finalIndex >= length) {
		return undefined;
	}
	if (finalIndex < 0) {
		finalIndex = finalIndex + length;
	}
	return finalIndex;
}
