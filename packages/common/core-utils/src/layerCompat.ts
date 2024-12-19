/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Result of a layer compatibility check.
 * @internal
 */
export type LayerCompatCheckResult =
	| { readonly compatible: true }
	| {
			readonly compatible: false;
			readonly generationCompatible: boolean;
			readonly unsupportedFeatures: string[];
	  };

/**
 * Checks the layer compatibility of a given layer (layer1) with another layer (layer2).
 * @param requiredFeaturesLayer1 - The features required by layer 1.
 * @param generationLayer1 - The generation of layer 1.
 * @param supportedFeaturesLayer2 - The features supported by layer 2.
 * @returns true if the layers are compatible, false otherwise.
 *
 * @internal
 */
export function checkLayerCompatibility(
	requiredFeaturesLayer1: string[],
	generationLayer1: number,
	supportedFeaturesLayer2: ReadonlyMap<string, unknown>,
): LayerCompatCheckResult {
	const minSupportedGeneration = supportedFeaturesLayer2.get(
		"minSupportedGeneration",
	) as number;
	// If layer1's generation is less than the minimum supported generation required by layer2, then layers are not compatible.
	if (minSupportedGeneration !== undefined && minSupportedGeneration > generationLayer1) {
		return { compatible: false, generationCompatible: false, unsupportedFeatures: [] };
	}

	const unsupportedFeatures: string[] = [];
	// All required features of layer1 must be supported by layer2 for them to be compatible.
	for (const feature of requiredFeaturesLayer1) {
		if (!supportedFeaturesLayer2.has(feature)) {
			unsupportedFeatures.push(feature);
		}
	}
	return unsupportedFeatures.length === 0
		? { compatible: true }
		: { compatible: false, generationCompatible: true, unsupportedFeatures };
}
