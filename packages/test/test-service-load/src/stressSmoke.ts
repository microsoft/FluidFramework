/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import { assert } from "@fluidframework/core-utils/internal";

import type { ITestUserConfig } from "./nodeStressTest.js";
import { pkgName, pkgVersion } from "./packageVersion.js";
import type { ILoadTestConfig } from "./testConfigFile.js";
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

export async function smokeTest(
	testDriver: ITestDriver,
	profile: ILoadTestConfig,
	args: {
		verbose?: true;
		testUsers?: ITestUserConfig;
		profileName: string;
	},
) {
	const logger = await createLogger({
		driverType: testDriver.type,
		driverEndpointName: testDriver.endpointName,
		profile: args.profileName,
		runId: undefined,
	});

	// Construct the loader
	const loader = new Loader({
		urlResolver: testDriver.createUrlResolver(),
		documentServiceFactory: testDriver.createDocumentServiceFactory(),
		codeLoader: createCodeLoader({}),
		logger,
	});

	const container: IContainer = await loader.createDetachedContainer(codeDetails);

	const testId = Date.now().toString();
	const request = testDriver.createCreateNewRequest(testId);
	console.log("Attaching container...");
	await container.attach(request);
	assert(container.resolvedUrl !== undefined, "Container missing resolved URL after attach");
	console.log("Container successfully attached!");
	const resolvedUrl = container.resolvedUrl;
	container.dispose();

	return testDriver.createContainerUrl(testId, resolvedUrl);
}
