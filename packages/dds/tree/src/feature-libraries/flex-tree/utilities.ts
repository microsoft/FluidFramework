/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AnchorNode,
	AnchorSet,
	DetachedField,
	anchorSlot,
	getDetachedFieldContainingPath,
	rootField,
} from "../../core/index.js";
import { TreeStatus } from "./flexTreeTypes.js";
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
export function treeStatusFromAnchorCache(anchors: AnchorSet, anchorNode: AnchorNode): TreeStatus {
	const cache = anchorNode.slots.get(detachedFieldSlot);
	if (cache === undefined) {
		// If the cache is undefined, set the cache and return the treeStatus based on the detached field.
		return treeStatusFromDetachedField(
			getCachedUpdatedDetachedField(anchorNode, anchors.generationNumber),
		);
	} else {
		// If the cache is up to date, return the treeStatus based on the cached detached field.
		const currentGenerationNumber = anchors.generationNumber;
		if (cache.generationNumber === currentGenerationNumber) {
			return treeStatusFromDetachedField(cache.detachedField);
		}
		// If the cache is not up to date, update the cache and return the treeStatus based on the updated detached field.
		return treeStatusFromDetachedField(
			getCachedUpdatedDetachedField(anchorNode, currentGenerationNumber),
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
