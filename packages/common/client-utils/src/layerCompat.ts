/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Result of a layer compatibility check - whether a layer is compatible with another layer.
 * @internal
 */
export type LayerCompatCheckResult =
	| { readonly isCompatible: true }
	| {
			readonly isCompatible: false;
			/**
			 * Whether the generation of the layer is compatible with the other layer.
			 */
			readonly isGenerationCompatible: boolean;
			/**
			 * The features that are required by the layer but are not supported by the other layer. This will only
			 * be set if there are unsupported features.
			 */
			readonly unsupportedFeatures: readonly string[] | undefined;
	  };

/**
 * @internal
 */
export const ILayerCompatDetails: keyof IProvideLayerCompatDetails = "ILayerCompatDetails";

/**
 * @internal
 */
export interface IProvideLayerCompatDetails {
	readonly ILayerCompatDetails: ILayerCompatDetails;
}

/**
 * This interface is used to communicate the compatibility details of a layer to another layer.
 * @internal
 */
export interface ILayerCompatDetails extends Partial<IProvideLayerCompatDetails> {
	/**
	 * A list of features supported by the layer at a particular layer boundary. This is used to check if these
	 * set of features satisfy the requirements of another layer.
	 */
	readonly supportedFeatures: ReadonlySet<string>;
	/**
	 * The generation of the layer. The other layer at the layer boundary uses this to check if this satisfies
	 * the minimum generation it requires to be compatible.
	 */
	readonly generation: number;
	/**
	 * The package version of the layer. When an incompatibility is detected, this is used to provide more context
	 * on what the versions of the incompatible layers are.
	 */
	readonly pkgVersion: string;
}

/**
 * This is the default compat details for a layer when it doesn't provide any compat details. This is used for
 * backwards compatibility to allow older layers to work before compatibility enforcement was introduced.
 * @internal
 */
export const defaultLayerCompatDetails: ILayerCompatDetails = {
	supportedFeatures: new Set(),
	generation: 0, // 0 is reserved for layers before compatibility enforcement was introduced.
	pkgVersion: "unknown",
};

/**
 * The requirements that a layer needs another layer to support for them to be compatible.
 * @internal
 */
export interface ILayerCompatSupportRequirements {
	/**
	 * The minimum supported generation the other layer needs to be at.
	 */
	readonly minSupportedGeneration: number;
	/**
	 * The features that the other layer needs to support.
	 */
	readonly requiredFeatures: readonly string[];
}

/**
 * Checks compatibility of a layer (layer1) with another layer (layer2).
 * @param compatSupportRequirementsLayer1 - The requirements from layer1 that layer2 needs to meet.
 * @param compatDetailsLayer2 - The compatibility details of the layer2. If this is undefined, then the
 * default compatibility details are used for backwards compatibility.
 * @returns The result of the compatibility check indicating whether layer2 is compatible with layer1.
 *
 * @internal
 */
export function checkLayerCompatibility(
	compatSupportRequirementsLayer1: ILayerCompatSupportRequirements,
	compatDetailsLayer2: ILayerCompatDetails | undefined,
): LayerCompatCheckResult {
	const compatDetailsLayer2ToUse = compatDetailsLayer2 ?? defaultLayerCompatDetails;
	let isGenerationCompatible = true;
	const unsupportedFeatures: string[] = [];

	// If layer2's generation is less than the required minimum supported generation of layer1,
	// then it is not compatible.
	if (
		compatDetailsLayer2ToUse.generation <
		compatSupportRequirementsLayer1.minSupportedGeneration
	) {
		isGenerationCompatible = false;
	}

	// All features required by layer1 must be supported by layer2 to be compatible.
	for (const feature of compatSupportRequirementsLayer1.requiredFeatures) {
		if (!compatDetailsLayer2ToUse.supportedFeatures.has(feature)) {
			unsupportedFeatures.push(feature);
		}
	}

	return isGenerationCompatible && unsupportedFeatures.length === 0
		? { isCompatible: true }
		: {
				isCompatible: false,
				isGenerationCompatible,
				unsupportedFeatures: unsupportedFeatures.length > 0 ? unsupportedFeatures : undefined,
			};
}
