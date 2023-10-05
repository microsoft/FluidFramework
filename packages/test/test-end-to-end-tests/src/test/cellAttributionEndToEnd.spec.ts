/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { AttributionInfo } from "@fluidframework/runtime-definitions";
import {
	createRuntimeAttributor,
	enableOnNewFileKey,
	IRuntimeAttributor,
} from "@fluid-experimental/attributor";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedCell } from "@fluidframework/cell";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import {
	describeNoCompat,
	itSkipsFailureOnSpecificDrivers,
} from "@fluid-internal/test-version-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

const cellId = "sharedCellKey";
const registry: ChannelFactoryRegistry = [[cellId, SharedCell.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

function assertAttributionMatches(
	sharedCell: SharedCell,
	attributor: IRuntimeAttributor,
	expected: Partial<AttributionInfo> | "detached" | "local" | undefined,
): void {
	const key = sharedCell.getAttribution();

	switch (expected) {
		case "detached":
			assert.deepEqual(
				key,
				{ type: "detached", id: 0 },
				"expected attribution key to be detached",
			);
			assert.equal(
				attributor.has(key),
				false,
				"Expected RuntimeAttributor to not attribute detached key.",
			);
			break;
		case "local":
			assert.deepEqual(key, { type: "local" });
			assert.equal(
				attributor.has(key),
				false,
				"Expected RuntimeAttributor to not attribute local key.",
			);
			break;
		case undefined:
			assert.deepEqual(key, expected);
			break;
		default: {
			if (key === undefined) {
				assert.fail("Expected a defined key, but got an undefined one");
			}
			const { timestamp, user } = attributor.get(key) ?? {};
			if (expected.timestamp !== undefined) {
				assert.equal(timestamp, expected.timestamp);
			}
			if (expected.user !== undefined) {
				assert.deepEqual(user, expected.user);
			}
			break;
		}
	}
}

describeNoCompat("Attributor for SharedCell", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const sharedCellFromContainer = async (container: IContainer) => {
		const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		return dataObject.getSharedObject<SharedCell>(cellId);
	};

	const getTestConfig = (runtimeAttributor?: IRuntimeAttributor): ITestContainerConfig => ({
		...testContainerConfig,
		enableAttribution: runtimeAttributor !== undefined,
		loaderProps: {
			scope: { IRuntimeAttributor: runtimeAttributor },
			configProvider: configProvider({
				[enableOnNewFileKey]: runtimeAttributor !== undefined,
			}),
			options: {
				attribution: {
					track: runtimeAttributor !== undefined,
				},
			},
		},
	});

	/**
	 * Tracked by AB#4997, if no error event is detected within one sprint, we will remove
	 * the skipping or take actions accordingly if it is.
	 */
	itSkipsFailureOnSpecificDrivers(
		"Can attribute content from multiple collaborators",
		["tinylicious", "t9s"],
		async () => {
			const attributor = createRuntimeAttributor();
			const container1 = await provider.makeTestContainer(getTestConfig(attributor));
			const sharedCell1 = await sharedCellFromContainer(container1);
			const container2 = await provider.loadTestContainer(testContainerConfig);
			const sharedCell2 = await sharedCellFromContainer(container2);

			assert(
				container1.clientId !== undefined && container2.clientId !== undefined,
				"Both containers should have client ids.",
			);

			sharedCell1.set(1);
			assertAttributionMatches(sharedCell1, attributor, "local");
			await provider.ensureSynchronized();

			sharedCell2.set(2);
			await provider.ensureSynchronized();

			assertAttributionMatches(sharedCell1, attributor, {
				user: container1.audience.getMember(container2.clientId)?.user,
			});

			sharedCell1.set(3);
			await provider.ensureSynchronized();

			assertAttributionMatches(sharedCell1, attributor, {
				user: container2.audience.getMember(container1.clientId)?.user,
			});
		},
	);

	it("attributes content created in a detached state", async () => {
		const attributor = createRuntimeAttributor();
		const loader = provider.makeTestLoader(getTestConfig(attributor));
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container1 = await loader.createDetachedContainer(defaultCodeDetails);
		const sharedCell1 = await sharedCellFromContainer(container1);

		sharedCell1.set(1);
		assertAttributionMatches(sharedCell1, attributor, "detached");

		await container1.attach(provider.driver.createCreateNewRequest("doc id"));
		await provider.ensureSynchronized();

		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined);
		const loader2 = provider.makeTestLoader(getTestConfig());
		const container2 = await loader2.resolve({ url });

		const sharedCell2 = await sharedCellFromContainer(container2);
		sharedCell2.set(2);

		await provider.ensureSynchronized();

		assert(
			container1.clientId !== undefined && container2.clientId !== undefined,
			"Both containers should have client ids.",
		);

		assertAttributionMatches(sharedCell1, attributor, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
	});
});
