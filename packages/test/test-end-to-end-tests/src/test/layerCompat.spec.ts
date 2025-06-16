/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type {
	ILayerCompatDetails,
	ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { TestDriverTypes } from "@fluid-internal/test-driver-definitions";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	driverSupportRequirements,
	loaderCoreCompatDetails,
} from "@fluidframework/container-loader/internal";
import { type ITelemetryBaseProperties } from "@fluidframework/core-interfaces/internal";
import { localDriverCompatDetailsForLoader } from "@fluidframework/local-driver/internal";
import { odspDriverCompatDetailsForLoader } from "@fluidframework/odsp-driver/internal";
import { r11sDriverCompatDetailsForLoader } from "@fluidframework/routerlicious-driver/internal";
import { isUsageError, ITestObjectProvider } from "@fluidframework/test-utils/internal";

type ILayerCompatSupportRequirementsOverride = Omit<
	ILayerCompatSupportRequirements,
	"requiredFeatures" | "minSupportedGeneration"
> & {
	requiredFeatures: (typeof driverSupportRequirements)["requiredFeatures"];
	minSupportedGeneration: (typeof driverSupportRequirements)["minSupportedGeneration"];
};

type LayerType = "Loader" | "Driver";

function validateFailureProperties(
	error: Error,
	isGenerationCompatible: boolean,
	layerTypes: LayerType[],
	minSupportedGeneration: number,
	driverCompatDetailsForLoader: ILayerCompatDetails,
	unsupportedFeatures?: string[],
): boolean {
	assert(isUsageError(error), "Error should be a usageError");
	const telemetryProps = error.getTelemetryProperties();
	assert(typeof telemetryProps.errorDetails === "string", "Error details should be present");
	const properties = JSON.parse(telemetryProps.errorDetails) as ITelemetryBaseProperties;
	assert.strictEqual(
		properties.isGenerationCompatible,
		isGenerationCompatible,
		"Generation compatibility not as expected",
	);
	assert.strictEqual(
		properties.minSupportedGeneration,
		minSupportedGeneration,
		"Minimum supported generation not as expected",
	);
	assert.deepStrictEqual(
		properties.unsupportedFeatures,
		unsupportedFeatures,
		"Unsupported features not as expected",
	);

	for (const layerType of layerTypes) {
		switch (layerType) {
			case "Loader":
				assert.strictEqual(
					properties.loaderVersion,
					loaderCoreCompatDetails.pkgVersion,
					"Runtime version not as expected",
				);
				assert.strictEqual(
					properties.loaderGeneration,
					loaderCoreCompatDetails.generation,
					"Runtime generation not as expected",
				);
				break;
			case "Driver":
				assert.strictEqual(
					properties.driverVersion,
					driverCompatDetailsForLoader.pkgVersion,
					"Driver version not as expected",
				);
				assert.strictEqual(
					properties.driverGeneration,
					driverCompatDetailsForLoader.generation,
					"Driver generation not as expected",
				);
				break;
			default:
				assert.fail(`Unexpected layer type: ${layerType}`);
		}
	}
	return true;
}

function getDriverCompatDetailsForLoader(driverType: TestDriverTypes): ILayerCompatDetails {
	switch (driverType) {
		case "tinylicious":
		case "t9s":
		case "routerlicious":
		case "r11s":
			return r11sDriverCompatDetailsForLoader;
		case "odsp":
			return odspDriverCompatDetailsForLoader;
		case "local":
			return localDriverCompatDetailsForLoader;
		default:
			assert.fail(`Unexpected driver type: ${driverType}`);
	}
}

describeCompat("Layer compatibility", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();
	});

	describe("Loader / Driver compat", () => {
		let driverCompatDetailsForLoader: ILayerCompatDetails;
		const driverSupportRequirementsOverride =
			driverSupportRequirements as ILayerCompatSupportRequirementsOverride;
		let originalRequiredFeatures: readonly string[];
		let originalMinSupportedGeneration: number;

		beforeEach(() => {
			driverCompatDetailsForLoader = getDriverCompatDetailsForLoader(provider.driver.type);
			originalRequiredFeatures = [...driverSupportRequirementsOverride.requiredFeatures];
			originalMinSupportedGeneration =
				driverSupportRequirementsOverride.minSupportedGeneration;
		});

		afterEach(() => {
			driverSupportRequirementsOverride.requiredFeatures = [...originalRequiredFeatures];
			driverSupportRequirementsOverride.minSupportedGeneration =
				originalMinSupportedGeneration;
		});

		it(`Driver is compatible with Loader`, async () => {
			driverSupportRequirementsOverride.requiredFeatures = [
				...driverCompatDetailsForLoader.supportedFeatures,
			];
			driverSupportRequirementsOverride.minSupportedGeneration =
				driverCompatDetailsForLoader.generation;

			await assert.doesNotReject(
				async () => provider.makeTestContainer(),
				`Driver should be compatible with Loader`,
			);
		});

		itExpects(
			`Driver generation is not compatible with Loader`,
			[{ eventName: "fluid:telemetry:Container:ContainerDispose", errorType: "usageError" }],
			async () => {
				driverSupportRequirementsOverride.requiredFeatures = [
					...driverCompatDetailsForLoader.supportedFeatures,
				];
				driverSupportRequirementsOverride.minSupportedGeneration =
					driverCompatDetailsForLoader.generation + 1;
				await assert.rejects(
					async () => provider.makeTestContainer(),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							["Loader", "Driver"] /* layerTypes */,
							driverSupportRequirementsOverride.minSupportedGeneration,
							driverCompatDetailsForLoader,
						),
					`Driver's generation should not be compatible with Loader`,
				);
			},
		);

		itExpects(
			`Driver supported features are not compatible with Loader`,
			[{ eventName: "fluid:telemetry:Container:ContainerDispose", errorType: "usageError" }],
			async () => {
				const requiredFeatures = ["feature2", "feature3"];
				driverSupportRequirementsOverride.requiredFeatures = requiredFeatures;
				driverSupportRequirementsOverride.minSupportedGeneration =
					driverCompatDetailsForLoader.generation;
				await assert.rejects(
					async () => provider.makeTestContainer(),
					(e: Error) =>
						validateFailureProperties(
							e,
							true /* isGenerationCompatible */,
							["Loader", "Driver"] /* layerTypes */,
							driverSupportRequirementsOverride.minSupportedGeneration,
							driverCompatDetailsForLoader,
							requiredFeatures,
						),
					`Driver's supported features should not be compatible with Loader`,
				);
			},
		);
	});
});
