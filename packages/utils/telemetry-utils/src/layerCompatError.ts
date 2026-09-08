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
 *
 * @param validatingLayer - The layer whose support requirements define compatibility. The `targetLayer` must meet
 * these requirements to be considered compatible.
 * - `layer`: The name of this layer.
 * - `packageInfo`: The package version / generation of this layer, used for telemetry attribution.
 * - `compatSupportRequirements`: The requirements the `targetLayer` must satisfy to be compatible with this layer.
 * @param targetLayer - The layer being validated against the `validatingLayer`'s requirements.
 * - `layer`: The name of this layer.
 * - `compatDetails`: The compatibility details of this layer. Can be undefined if this layer does not provide them.
 * - `strictCompatibilityCheck`: If true, default compatibility details are used for this layer when its details are missing, and validation proceeds. If false (default), the compatibility check is skipped when details are missing and an error is logged instead.
 * @param context - Ambient dependencies for the validation.
 * - `disposeFn`: A function that will be called with the error if the layers are incompatible.
 * - `mc`: The monitoring context for logging and reading configuration.
 *
 * @internal
 */
export function validateLayerCompatibility(
	validatingLayer: {
		layer: FluidLayer;
		packageInfo: Pick<ILayerCompatDetails, "pkgVersion" | "generation">;
		compatSupportRequirements: ILayerCompatSupportRequirements;
	},
	targetLayer: {
		layer: FluidLayer;
		compatDetails: ILayerCompatDetails | undefined;
		strictCompatibilityCheck?: boolean;
	},
	context: {
		disposeFn: (error?: IErrorBase) => void;
		mc: MonitoringContext;
	},
): void {
	const {
		layer: validatingLayerName,
		packageInfo: validatingLayerPackageInfo,
		compatSupportRequirements: validatingLayerSupportRequirements,
	} = validatingLayer;
	const {
		layer: targetLayerName,
		compatDetails: maybeTargetLayerCompatDetails,
		strictCompatibilityCheck = false,
	} = targetLayer;
	const { disposeFn, mc } = context;

	const layerCheckResult = checkLayerCompatibility(
		validatingLayerSupportRequirements,
		maybeTargetLayerCompatDetails,
	);
	if (!layerCheckResult.isCompatible) {
		const coreProperties = {
			layer: validatingLayerName,
			incompatibleLayer: targetLayerName,
			layerVersion: validatingLayerPackageInfo.pkgVersion,
			incompatibleLayerVersion: maybeTargetLayerCompatDetails?.pkgVersion ?? "unknown",
			compatibilityRequirementsInMonths:
				validatingLayerPackageInfo.generation -
				validatingLayerSupportRequirements.minSupportedGeneration,
			actualDifferenceInMonths:
				validatingLayerPackageInfo.generation -
				(maybeTargetLayerCompatDetails?.generation ?? 0),
		};
		const detailedProperties = {
			layerGeneration: validatingLayerPackageInfo.generation,
			incompatibleLayerGeneration: maybeTargetLayerCompatDetails?.generation,
			minSupportedGeneration: validatingLayerSupportRequirements.minSupportedGeneration,
			isGenerationCompatible: layerCheckResult.isGenerationCompatible,
			unsupportedFeatures: layerCheckResult.unsupportedFeatures,
		};

		const error = new LayerIncompatibilityError(
			`The versions of the ${validatingLayerName} and ${targetLayerName} are not compatible`,
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

		if (maybeTargetLayerCompatDetails === undefined && !strictCompatibilityCheck) {
			// If there is no compatibility details for the target layer and strictCompatibilityCheck is false, do not
			// fail. There can be a couple of scenarios where this can happen:
			// 1. The target layer's version is older than the version where compatibility enforcement was introduced.
			//    In this case, the behavior is the same as before compatibility enforcement was introduced.
			// 2. The target layer has a custom implementation which doesn't provide compatibility details. In this
			//    case, we don't know for sure that it is incompatible. It may fail at a later point when it tries to
			//    use some feature that the Runtime doesn't support.
			if (!strictCheckBypassLoggedForPair.has(`${validatingLayerName}-${targetLayerName}`)) {
				// This event is only logged once per session per layer combination to avoid flooding telemetry.
				strictCheckBypassLoggedForPair.add(`${validatingLayerName}-${targetLayerName}`);
				mc.logger.sendTelemetryEvent(
					{
						eventName: "LayerIncompatibilityDetectedButBypassed",
						reason: `No compatibility details provided for ${targetLayerName} and strictCompatibilityCheck is false`,
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
