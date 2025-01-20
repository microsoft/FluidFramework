/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	LayerCompatibilityManager,
	type ICompatibilityDetails,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * This class manages the state and validation to ensure that the Runtime layer is compatible with the Loader layer.
 * @internal
 */
export class LoaderLayerCompatManager extends LayerCompatibilityManager {
	// Minimum generation that Loader must be at to be compatible with Runtime.
	public readonly loaderMinSupportedGeneration = 1;
	// The features that the Loader must support to be compatible with Runtime.
	public readonly loaderRequiredFeatures: string[] = [];

	public constructor(private readonly disposeFn: (error?: ICriticalContainerError) => void) {
		super({
			// The current package version of the Runtime layer.
			pkgVersion,
			// The current generation of the Runtime layer.
			generation: 1,
			// The features supported by the Runtime layer across Runtime <-> Loader boundary.
			supportedFeatures: new Set(),
		});
	}

	/**
	 * Validates that the Loader layer is compatible with the Runtime.
	 */
	public validateCompatibility(
		maybeLoaderCompatDetails: ICompatibilityDetails | undefined,
	): void {
		// For backwards compatibility - until required features are added, Loader is considered
		// to be compatible. This is to allow Runtime to work with existing Loaders. Once we start
		// enforcing layer compatibility, we will add required features or remove this check.
		if (this.loaderRequiredFeatures.length === 0) {
			return;
		}

		const layerCheckResult = super.checkCompatibility(
			this.loaderMinSupportedGeneration,
			this.loaderRequiredFeatures,
			maybeLoaderCompatDetails,
		);
		if (!layerCheckResult.isCompatible) {
			const error = new UsageError("Runtime is not compatible with Loader", {
				version: pkgVersion,
				loaderVersion: maybeLoaderCompatDetails?.pkgVersion,
				generation: this.generation,
				loaderGeneration: maybeLoaderCompatDetails?.generation,
				minSupportedGeneration: this.loaderMinSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: JSON.stringify(layerCheckResult.unsupportedFeatures),
			});
			this.disposeFn(error);
			throw error;
		}
	}
}
