/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Checks the layer compatibility of a given layer (layer1) with another layer (layer2).
 * @param supportedFeatures - The features supported by layer2.
 * @param requiredFeatures - The features required by layer1.
 * @param generation - The generation of layer1.
 * @returns true if the layers are compatible, false otherwise.
 *
 * @internal
 */
export function checkLayerCompatibility(
	supportedFeatures: ReadonlyMap<string, unknown>,
	requiredFeatures: string[],
	generation: number,
): boolean {
	const minSupportedGeneration = supportedFeatures.get("minSupportedGeneration") as number;
	// If layer1's generation is less than the minimum supported generation required by layer2, then layers are not compatible.
	if (minSupportedGeneration !== undefined && minSupportedGeneration > generation) {
		return false;
	}

	// All required features of layer1 must be supported by layer2 for them to be compatible.
	for (const feature of requiredFeatures) {
		if (!supportedFeatures.has(feature)) {
			return false;
		}
	}
	return true;
}
