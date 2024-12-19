/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ICriticalContainerError,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { ContainerRuntime, currentRuntimeGeneration } from "../containerRuntime.js";
import { pkgVersion } from "../packageVersion.js";

import { getMockContainerContext } from "./mockContainerContext.js";

describe("Layer compatibility", () => {
	const mockProvideEntryPoint = async () => ({
		myProp: "myValue",
	});

	// Override private types in container runtime to validate loader compatibility with
	// mock required features.
	type ContainerRuntimeWithPrivates = Omit<
		ContainerRuntime,
		"validateLoaderCompatibility" | "requiredFeaturesFromLoader"
	> & {
		requiredFeaturesFromLoader: string[];
		validateLoaderCompatibility(
			loaderSupportedFeatures?: ReadonlyMap<string, unknown>,
			loaderVersion?: string,
		): void;
	};

	const loaderVersion = "1.0.0";
	let error: ICriticalContainerError | undefined;
	const closeFn = (e?: ICriticalContainerError): void => {
		error = e;
	};

	function getContainerContext(
		loaderSupportedFeatures: Map<string, unknown>,
	): IContainerContext {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {
			...getMockContainerContext({}, "mockClientId"),
			closeFn,
			supportedFeatures: loaderSupportedFeatures,
			pkgVersion: loaderVersion,
		} as IContainerContext;
	}

	function validateFailureProperties(
		isGenerationCompatible: boolean,
		minSupportedGeneration: number,
		unsupportedFeatures?: string[],
	) {
		assert(error !== undefined, "An error should have been thrown");
		assert.strictEqual(
			error.errorType,
			FluidErrorTypes.usageError,
			"Error type should be usageError",
		);
		const properties = (error as UsageError).getTelemetryProperties();
		assert.strictEqual(
			properties.isGenerationCompatible,
			isGenerationCompatible,
			"Generation compatibility not as expected",
		);
		assert.strictEqual(
			properties.runtimeVersion,
			pkgVersion,
			"Runtime version not as expected",
		);
		assert.strictEqual(
			properties.loaderVersion,
			loaderVersion,
			"Loader version not as expected",
		);
		assert.strictEqual(
			properties.runtimeGeneration,
			currentRuntimeGeneration,
			"Runtime generation not as expected",
		);
		assert.strictEqual(
			properties.minSupportedGeneration,
			minSupportedGeneration,
			"Min supported generation not as expected",
		);
		assert.strictEqual(
			properties.unsupportedFeatures,
			JSON.stringify(unsupportedFeatures),
			"Unsupported features not as expected",
		);
	}

	it("Runtime generation is compatible with Loader's minSupportedGeneration", async () => {
		const loaderSupportedFeatures = new Map([["minSupportedGeneration", 1]]);
		await assert.doesNotReject(
			async () =>
				ContainerRuntime.loadRuntime({
					context: getContainerContext(loaderSupportedFeatures),
					registryEntries: [],
					existing: false,
					provideEntryPoint: mockProvideEntryPoint,
				}),
			"Runtime should be compatible with Loader layer",
		);
		assert.strictEqual(error, undefined, "No error should have been thrown");
	});

	it("Runtime generation is incompatible than Loader's minSupportedGeneration", async () => {
		const minSupportedGeneration = 2;
		const loaderSupportedFeatures = new Map([
			["minSupportedGeneration", minSupportedGeneration],
		]);
		await assert.rejects(
			async () =>
				ContainerRuntime.loadRuntime({
					context: getContainerContext(loaderSupportedFeatures),
					registryEntries: [],
					existing: false,
					provideEntryPoint: mockProvideEntryPoint,
				}),
			(e: Error) => e.message === "Runtime is not compatible with Loader",
			"Runtime should be compatible with Loader layer",
		);
		validateFailureProperties(false /* isGenerationCompatible */, minSupportedGeneration);
	});

	it("Runtime features are incompatible with Loader layer", async () => {
		const minSupportedGeneration = 1;
		const loaderSupportedFeatures = new Map<string, unknown>([
			["minSupportedGeneration", minSupportedGeneration],
			["feature1", true],
		]);
		const runtimeOnlyFeatures = ["feature2"];

		const runtime = (await ContainerRuntime.loadRuntime({
			context: getContainerContext(loaderSupportedFeatures),
			registryEntries: [],
			existing: false,
			provideEntryPoint: mockProvideEntryPoint,
		})) as unknown as ContainerRuntimeWithPrivates;

		runtime.requiredFeaturesFromLoader = runtimeOnlyFeatures;
		assert.throws(
			() => runtime.validateLoaderCompatibility(loaderSupportedFeatures, loaderVersion),
			(e: Error) => e.message === "Runtime is not compatible with Loader",
		);

		validateFailureProperties(
			true /* isGenerationCompatible */,
			minSupportedGeneration,
			runtimeOnlyFeatures,
		);
	});
});
