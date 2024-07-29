/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { assert } from "@fluidframework/core-utils/internal";

import { FileLogger } from "./FileLogger.js";
import { pkgName, pkgVersion } from "./packageVersion.js";
import { createCodeLoader } from "./utils.js";

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
	const logger = await FileLogger.createLogger({
		driverType: testDriver.type,
		driverEndpointName: testDriver.endpointName,
		profile: profileName,
		runId: undefined,
	});

	// Construct the loader
	const loader = new Loader({
		urlResolver: testDriver.createUrlResolver(),
		documentServiceFactory: testDriver.createDocumentServiceFactory(),
		codeLoader: createCodeLoader(), // For the smoke test, just run with default container runtime options
		logger,
	});

	// Verify container creation works
	console.log("Creating container and attaching...");
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

	const url = await testDriver.createContainerUrl(testId, resolvedUrl);
	console.log("Container successfully created and attached!");

	// Verify container loading works
	console.log("Loading container...");
	const loadedContainer = await loader.resolve({ url });
	loadedContainer.dispose();
	console.log("Container successfully loaded!");

	return url;
}
