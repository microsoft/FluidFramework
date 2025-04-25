/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { ILayerCompatSupportRequirements } from "@fluid-internal/client-utils";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import {
	driverSupportRequirements,
	loaderCoreCompatDetails,
} from "@fluidframework/container-loader/internal";
import {
	FluidErrorTypes,
	type ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces/internal";
import { localDriverCompatDetailsForLoader } from "@fluidframework/local-driver/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

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
	unsupportedFeatures?: string[],
): boolean {
	assert(error instanceof UsageError, "The error should be a UsageError");
	assert.strictEqual(
		error.errorType,
		FluidErrorTypes.usageError,
		"Error type should be usageError",
	);
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
					localDriverCompatDetailsForLoader.pkgVersion,
					"Driver version not as expected",
				);
				assert.strictEqual(
					properties.driverGeneration,
					localDriverCompatDetailsForLoader.generation,
					"Driver generation not as expected",
				);
				break;
			default:
				assert.fail(`Unexpected layer type: ${layerType}`);
		}
	}
	return true;
}

describeCompat("Layer compatibility", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();

		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	describe("Loader / Driver compat", () => {
		const driverSupportRequirementsOverride =
			driverSupportRequirements as ILayerCompatSupportRequirementsOverride;
		let originalRequiredFeatures: readonly string[];
		let originalMinSupportedGeneration: number;

		beforeEach(() => {
			originalRequiredFeatures = driverSupportRequirementsOverride.requiredFeatures;
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
				...localDriverCompatDetailsForLoader.supportedFeatures,
			];
			driverSupportRequirementsOverride.minSupportedGeneration =
				localDriverCompatDetailsForLoader.generation;

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
					...localDriverCompatDetailsForLoader.supportedFeatures,
				];
				driverSupportRequirementsOverride.minSupportedGeneration =
					localDriverCompatDetailsForLoader.generation + 1;
				await assert.rejects(
					async () => provider.makeTestContainer(),
					(e: Error) =>
						validateFailureProperties(
							e,
							false /* isGenerationCompatible */,
							["Loader", "Driver"] /* layerTypes */,
							driverSupportRequirementsOverride.minSupportedGeneration,
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
					localDriverCompatDetailsForLoader.generation;
				await assert.rejects(
					async () => provider.makeTestContainer(),
					(e: Error) =>
						validateFailureProperties(
							e,
							true /* isGenerationCompatible */,
							["Loader", "Driver"] /* layerTypes */,
							driverSupportRequirementsOverride.minSupportedGeneration,
							requiredFeatures,
						),
					`Driver's supported features should not be compatible with Loader`,
				);
			},
		);
	});
});
