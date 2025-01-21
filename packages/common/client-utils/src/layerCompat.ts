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
			readonly unsupportedFeatures: string[] | undefined;
	  };

/**
 * @internal
 */
export const ICompatibilityDetails: keyof IProvideCompatibilityDetails =
	"ICompatibilityDetails";

/**
 * @internal
 */
export interface IProvideCompatibilityDetails {
	readonly ICompatibilityDetails: ICompatibilityDetails;
}

/**
 * This interface is used to communicate the compatibility details of a layer to another layer.
 * @internal
 */
export interface ICompatibilityDetails extends Partial<IProvideCompatibilityDetails> {
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
 * Checks compatibility of a layer with another layer (layer2).
 * @param minSupportedGeneration - The minimum supported generation layer2 needs to be at.
 * @param requiredFeatures - The features that layer2 needs to support.
 * @param compatDetails - The compatibility details of the layer2.
 * @returns The result of the compatibility check.
 *
 * @internal
 */
export function checkLayerCompatibility(
	minSupportedGeneration: number,
	requiredFeatures: string[],
	compatDetailsLayer2: ICompatibilityDetails | undefined,
): LayerCompatCheckResult {
	// If the other doesn't have compat details, then the layers are not compatible.
	if (compatDetailsLayer2 === undefined) {
		return {
			isCompatible: false,
			isGenerationCompatible: false,
			unsupportedFeatures: requiredFeatures,
		};
	}

	let isCompatible = true;
	let isGenerationCompatible = true;
	const unsupportedFeatures: string[] = [];

	// If the other layer's generation is less than the required minimum supported generation,
	//  then layers are not compatible.
	if (compatDetailsLayer2.generation < minSupportedGeneration) {
		isCompatible = false;
		isGenerationCompatible = false;
	}

	// All required features must be supported by the other for them to be compatible.
	for (const feature of requiredFeatures) {
		if (!compatDetailsLayer2.supportedFeatures.has(feature)) {
			isCompatible = false;
			unsupportedFeatures.push(feature);
		}
	}

	return isCompatible
		? { isCompatible }
		: {
				isCompatible,
				isGenerationCompatible,
				unsupportedFeatures: unsupportedFeatures.length > 0 ? unsupportedFeatures : undefined,
			};
}
