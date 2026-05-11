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

import type { MonitoringContext } from "./config.js";
import { LayerIncompatibilityError } from "./error.js";

/**
 * The config key to disable layer compatibility validation.
 * @internal
 */
export const allowIncompatibleLayersKey = "Fluid.AllowIncompatibleLayers";

/**
 * Tracks whether the event is logged when failing on layer incompatibility is bypassed via global config.
 * This is used to ensure that the bypass event is only logged once per session so it does not flood telemetry.
 */
let globalBypassLogged = false;

/**
 * Tracks whether the event is logged when failing on layer incompatibility is bypassed due to missing
 * compatibility details for each layer pair.
 * This is used to ensure that the bypass event is only logged once per layer pair so it does not flood telemetry.
 */
const strictCheckBypassLoggedForPair: Set<string> = new Set<string>();

/**
 * Validates the compatibility between two layers using their compatibility details and support requirements.
 * If the layers are incompatible, it logs a "LayerIncompatibilityError" error event. It will also call the dispose
 * function with the error and throw the error.
 * @param layer1 - The name of the first layer.
 * @param layer2 - The name of the second layer.
 * @param compatDetailsLayer1 - The compatibility details of the first layer.
 * @param compatSupportRequirementsLayer1 - The support requirements that the second layer must meet to be compatible
 * with the first layer.
 * @param maybeCompatDetailsLayer2 - The compatibility details of the second layer. This can be undefined if the
 * second layer does not provide compatibility details.
 * @param disposeFn - A function that will be called with the error if the layers are incompatible.
 * @param mc - The monitoring context for logging and reading configuration.
 * @param strictCompatibilityCheck - If true, the function will use default compatibility details for the second layer if
 * they are missing and use it for validation.
 * If false, it will skip the compatibility check if the details are missing and just log an error.
 * Defaults to false.
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
	mc: MonitoringContext,
	strictCompatibilityCheck: boolean = false,
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

		if (mc.config.getBoolean(allowIncompatibleLayersKey) === true) {
			// If the validation is explicitly disabled via config, do not fail. This config provides a way to bypass
			// compatibility validation while this feature is being rolled out.
			if (!globalBypassLogged) {
				// This event is only logged once per session to avoid flooding telemetry.
				globalBypassLogged = true;
				mc.logger.sendTelemetryEvent(
					{
						eventName: "LayerIncompatibilityDetectedButBypassed",
						reason: `${allowIncompatibleLayersKey} config is set to true`,
					},
					error,
				);
			}
			return;
		}

		if (maybeCompatDetailsLayer2 === undefined && !strictCompatibilityCheck) {
			// If there is no compatibility details for layer2 and strictCompatibilityCheck is false, do not fail.
			// There can be a couple of scenarios where this can happen:
			// 1. layer2's version is older than the version where compatibility enforcement was introduced. In this
			//    case, the behavior is the same as before compatibility enforcement was introduced.
			// 2. layer2 has a custom implementation which doesn't provide compatibility details. In this case,
			//    we don't know for sure that it is incompatible. It may fail at a later point when it tries to use
			//    some feature that the Runtime doesn't support.
			if (!strictCheckBypassLoggedForPair.has(`${layer1}-${layer2}`)) {
				// This event is only logged once per session per layer combination to avoid flooding telemetry.
				strictCheckBypassLoggedForPair.add(`${layer1}-${layer2}`);
				mc.logger.sendTelemetryEvent(
					{
						eventName: "LayerIncompatibilityDetectedButBypassed",
						reason: `No compatibility details provided for ${layer2} and strictCompatibilityCheck is false`,
					},
					error,
				);
			}
			return;
		}

		mc.logger.sendErrorEvent(
			{
				eventName: "LayerIncompatibilityError",
			},
			error,
		);
		disposeFn(error);
		throw error;
	}
}
