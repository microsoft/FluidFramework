/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generatePairwiseOptions } from "@fluid-private/test-pairwise-generator";
import { describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { DisconnectReason } from "@fluidframework/container-definitions/internal";
import { LazyPromise } from "@fluidframework/core-utils/internal";
import { type ConnectionMode } from "@fluidframework/driver-definitions/internal";
import {
	createTestConfigProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../mocking.js";

describeCompat("Driver can control connection mode", "NoCompat", (getTestObjectProvider) => {
	for (const config of generatePairwiseOptions({
		driverConnectionMode: ["read", "write"] satisfies ConnectionMode[],
		forceWriteConnection: [true, false, undefined],
	})) {
		// only create a single container for this test, and reuse
		const getExistingContainerUrl = new LazyPromise(async () => {
			const provider = getTestObjectProvider();

			const container = await provider.createContainer(provider.createFluidEntryPoint());

			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined, "should not be undefined");
			container.dispose(DisconnectReason.Expected);
			return url;
		});

		itExpects(JSON.stringify(config), [], async () => {
			const { driverConnectionMode, forceWriteConnection } = config;
			const provider = getTestObjectProvider();
			// now that there is a container, connect to it, and a specific connection mode
			// at the driver layer
			const loader = provider.createLoader(
				[[provider.defaultCodeDetails, provider.createFluidEntryPoint()]],
				{
					configProvider: createTestConfigProvider({
						"Fluid.Container.ForceWriteConnection": forceWriteConnection,
					}),
					documentServiceFactory: wrapObjectAndOverride(provider.documentServiceFactory, {
						createDocumentService: {
							connectToDeltaStream: {
								mode: () => driverConnectionMode,
							},
						},
					}),
				},
			);

			const overrideContainer = await loader.resolve({ url: await getExistingContainerUrl });

			await waitForContainerConnection(overrideContainer, true);

			assert.strictEqual(
				overrideContainer.deltaManager.active,
				driverConnectionMode === "write",
				`delta manager active state must match mode:${driverConnectionMode}`,
			);
			overrideContainer.dispose(DisconnectReason.Expected);
		});
	}
});
