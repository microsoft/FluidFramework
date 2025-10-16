/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkLayerCompatibility,
	type FluidLayer,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { IErrorBase, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

import { UsageError } from "./error.js";

/**
 * Validates the compatibility between two layers using their compatibility details and support requirements.
 * @internal
 */
export function validateLayerCompatibility(
	layer1: FluidLayer,
	layer2: FluidLayer,
	compatDetailsLayer1: Pick<ILayerCompatDetails, "pkgVersion" | "generation">,
	compatSupportRequirementsLayer1: ILayerCompatSupportRequirements,
	maybeCompatDetailsLayer2: ILayerCompatDetails | undefined,
	disposeFn: (error?: IErrorBase) => void,
	logger: ITelemetryBaseLogger,
): void {
	const layerCheckResult = checkLayerCompatibility(
		compatSupportRequirementsLayer1,
		maybeCompatDetailsLayer2,
	);
	if (!layerCheckResult.isCompatible) {
		const coreProperties = {
			layer: layer1,
			incompatibleLayer: layer2,
			[`${layer1}Version`]: compatDetailsLayer1.pkgVersion,
			[`${layer2}Version`]: maybeCompatDetailsLayer2?.pkgVersion ?? "unknown",
			diff: compatDetailsLayer1.generation - (maybeCompatDetailsLayer2?.generation ?? 0),
		};
		const detailedProperties = {
			[`${layer1}Generation`]: compatDetailsLayer1.generation,
			[`${layer2}Generation`]: maybeCompatDetailsLayer2?.generation,
			minSupportedGeneration: compatSupportRequirementsLayer1.minSupportedGeneration,
			isGenerationCompatible: layerCheckResult.isGenerationCompatible,
			unsupportedFeatures: layerCheckResult.unsupportedFeatures,
		};
		const error = new UsageError(`${layer1} is not compatible with ${layer2}`, {
			...coreProperties,
			errorDetails: JSON.stringify(detailedProperties),
		});
		logger.send({
			eventName: "LayerIncompatibilityError",
			category: "error",
			errorDetails: JSON.stringify({ ...coreProperties, ...detailedProperties }),
		});
		disposeFn(error);
		throw error;
	}
}
