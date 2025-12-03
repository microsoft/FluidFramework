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
import type { IErrorBase } from "@fluidframework/core-interfaces";

import { LayerIncompatibilityError } from "./error.js";
import type { ITelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * Validates the compatibility between two layers using their compatibility details and support requirements.
 * If the layers are incompatible, it logs an "LayerIncompatibilityError" error event. It will also call the dispose
 * function with the error and throw the error.
 *
 * @internal
 */
export function validateLayerCompatibility(
	layer1: FluidLayer,
	layer2: FluidLayer,
	compatDetailsLayer1: Pick<ILayerCompatDetails, "pkgVersion" | "generation">,
	compatSupportRequirementsLayer1: ILayerCompatSupportRequirements,
	maybeCompatDetailsLayer2: ILayerCompatDetails | undefined,
	disposeFn: (error?: IErrorBase) => void,
	logger: ITelemetryLoggerExt,
): void {
	const layerCheckResult = checkLayerCompatibility(
		compatSupportRequirementsLayer1,
		maybeCompatDetailsLayer2,
	);
	if (!layerCheckResult.isCompatible) {
		const coreProperties = {
			layer: layer1,
			incompatibleLayer: layer2,
			layerVersion: compatDetailsLayer1.pkgVersion,
			incompatibleLayerVersion: maybeCompatDetailsLayer2?.pkgVersion ?? "unknown",
			compatibilityRequirementsInMonths:
				compatDetailsLayer1.generation -
				compatSupportRequirementsLayer1.minSupportedGeneration,
			actualDifferenceInMonths:
				compatDetailsLayer1.generation - (maybeCompatDetailsLayer2?.generation ?? 0),
		};
		const detailedProperties = {
			layerGeneration: compatDetailsLayer1.generation,
			incompatibleLayerGeneration: maybeCompatDetailsLayer2?.generation,
			minSupportedGeneration: compatSupportRequirementsLayer1.minSupportedGeneration,
			isGenerationCompatible: layerCheckResult.isGenerationCompatible,
			unsupportedFeatures: layerCheckResult.unsupportedFeatures,
		};

		const error = new LayerIncompatibilityError(
			`The versions of the ${layer1} and ${layer2} are not compatible`,
			{
				...coreProperties,
				details: JSON.stringify(detailedProperties),
			},
		);
		logger.sendErrorEvent(
			{
				eventName: "LayerIncompatibilityError",
			},
			error,
		);
		disposeFn(error);
		throw error;
	}
}
