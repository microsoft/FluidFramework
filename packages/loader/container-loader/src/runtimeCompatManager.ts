/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	checkLayerCompatibility,
	type ICompatibilityDetails,
	// type IProvideCompatibilityDetails,
} from "@fluid-internal/client-utils";
import type { ICriticalContainerError } from "@fluidframework/container-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * This class manages the state and validation to ensure that the Loader layer is compatible with the Runtime layer.
 * @internal
 */
export class RuntimeLayerCompatManager implements ICompatibilityDetails {
	/**
	 * The current package version of the Loader layer.
	 */
	public readonly pkgVersion = pkgVersion;
	/**
	 * The current generation of the Loader layer.
	 */
	public readonly generation = 1;
	/**
	 * The features supported by the Loader layer across Loader / Runtime boundary.
	 */
	public readonly supportedFeatures: ReadonlySet<string> = new Set();

	/**
	 * Minimum generation that Runtime must be at to be compatible with Loader.
	 */
	public readonly runtimeMinSupportedGeneration = 1;
	/**
	 * The features that the Runtime must support to be compatible with Loader.
	 */
	public readonly runtimeRequiredFeatures: string[] = [];

	public constructor(private readonly disposeFn: (error?: ICriticalContainerError) => void) {}

	/**
	 * Validates that the Runtime layer is compatible with the Loader.
	 */
	public validateCompatibility(
		maybeRuntimeCompatDetails: ICompatibilityDetails | undefined,
	): void {
		// For backwards compatibility - until required features are added, Runtime is considered
		// to be compatible. This is to allow Loader to work with existing Runtimes. Once we start
		// enforcing layer compatibility, we will add required features or remove this check.
		if (this.runtimeRequiredFeatures.length === 0) {
			return;
		}

		const layerCheckResult = checkLayerCompatibility(
			this.runtimeMinSupportedGeneration,
			this.runtimeRequiredFeatures,
			maybeRuntimeCompatDetails,
		);
		if (!layerCheckResult.isCompatible) {
			const error = new UsageError("Loader is not compatible with Runtime", {
				version: pkgVersion,
				runtimeVersion: maybeRuntimeCompatDetails?.pkgVersion,
				generation: this.generation,
				runtimeGeneration: maybeRuntimeCompatDetails?.generation,
				minSupportedGeneration: this.runtimeMinSupportedGeneration,
				isGenerationCompatible: layerCheckResult.isGenerationCompatible,
				unsupportedFeatures: JSON.stringify(layerCheckResult.unsupportedFeatures),
			});
			this.disposeFn(error);
			throw error;
		}
	}
}
