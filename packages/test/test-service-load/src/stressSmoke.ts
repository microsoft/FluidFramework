/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { assert } from "@fluidframework/core-utils/internal";

import { pkgName, pkgVersion } from "./packageVersion.js";
import { createCodeLoader, createLogger } from "./utils.js";

const packageName = `${pkgName}@${pkgVersion}`;
const codeDetails: IFluidCodeDetails = {
	package: packageName,
	config: {},
};

// The stress smoke test is run before the actual stress test.  Its job is not to actually
// perform stress, but instead just to confirm that the basic prerequisite capabilities
// (authentication, container creation, container loading, etc.) are functioning prior to
// running stress.  If the smoke test isn't working, it will give us a concrete failure
// to investigate and allow us to skip a (doomed) attempt at running the stress tests.

export async function smokeTest(testDriver: ITestDriver, profileName: string) {
	const logger = await createLogger({
		driverType: testDriver.type,
		driverEndpointName: testDriver.endpointName,
		profile: profileName,
		runId: undefined,
	});

	// Construct the loader
	const loader = new Loader({
		urlResolver: testDriver.createUrlResolver(),
		documentServiceFactory: testDriver.createDocumentServiceFactory(),
		codeLoader: createCodeLoader({}),
		logger,
	});

	const createContainerAndGetUrl = async () => {
		const createdContainer: IContainer = await loader.createDetachedContainer(codeDetails);

		const testId = Date.now().toString();
		const request = testDriver.createCreateNewRequest(testId);

		await createdContainer.attach(request);
		assert(
			createdContainer.resolvedUrl !== undefined,
			"Container missing resolved URL after attach",
		);

		const resolvedUrl = createdContainer.resolvedUrl;
		createdContainer.dispose();

		return testDriver.createContainerUrl(testId, resolvedUrl);
	};
	console.log("Creating container and attaching...");
	const url = await tryNTimes(createContainerAndGetUrl, 3, 3);
	console.log("Container successfully created and attached!");

	const loadContainer = async () => {
		const loadedContainer = await loader.resolve({ url });
		loadedContainer.dispose();
	};
	console.log("Loading container...");
	await tryNTimes(loadContainer, 3, 3);
	console.log("Container successfully loaded!");

	return url;
}

const tryNTimes = async <UnwrappedCallbackReturnType>(
	callback: () => Promise<UnwrappedCallbackReturnType>,
	attempts: number,
	attemptsDelaySeconds: number,
) => {
	for (let i = 1; i <= attempts; i++) {
		try {
			return await callback();
		} catch (error) {
			console.error(`Attempt ${i} / ${attempts} failed:`);
			console.error(error);
			if (i < attempts) {
				console.error(`Trying again in ${attemptsDelaySeconds} seconds...`);
				await new Promise((resolve) => setTimeout(resolve, attemptsDelaySeconds * 1000));
			} else {
				console.error(`Giving up.`);
				throw error;
			}
		}
	}
	throw new Error("Unreachable");
};
