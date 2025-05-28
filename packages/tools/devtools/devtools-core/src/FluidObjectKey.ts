/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

let counter = 0;

const visualizerIdMap = new WeakMap<object, number>();

/**
 * Associates a unique stringified number with an {@link @fluidframework/devtools/devtools-core#VisualizerNode} in {@link DataVisualization}.
 *
 * @remarks
 * The stringified ID number is tied to the object identity, not the object's contents; modifying the object will not cause it to get a different ID.
 * Adopted from the {@link @fluid-experimental/tree-react-api#objectIdNumber} function.
 */
export function getKeyForFluidObject(visualizerNode: object): string {
	const id = visualizerIdMap.get(visualizerNode);
	if (id !== undefined) {
		return id.toString();
	}
	counter++;
	visualizerIdMap.set(visualizerNode, counter);
	return counter.toString();
}
