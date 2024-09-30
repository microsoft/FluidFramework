/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	getRuntimeAttributor,
	IRuntimeAttributor,
	enableOnNewFileKey,
} from "@fluid-experimental/attributor";
import {
	describeCompat,
	itSkipsFailureOnSpecificDrivers,
} from "@fluid-private/test-version-utils";
import type { ISharedCell } from "@fluidframework/cell/internal";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { AttributionInfo } from "@fluidframework/runtime-definitions/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

function assertAttributionMatches(
	sharedCell: ISharedCell,
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

describeCompat("Attributor for SharedCell", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedCell } = apis.dds;

	const cellId = "sharedCellKey";
	const registry: ChannelFactoryRegistry = [[cellId, SharedCell.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const sharedCellFromContainer = async (container: IContainer) => {
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		return dataObject.getSharedObject<ISharedCell>(cellId);
	};

	const getTestConfig = (enable: boolean = false): ITestContainerConfig => ({
		...testContainerConfig,
		enableAttribution: enable,
		loaderProps: {
			configProvider: configProvider({
				[enableOnNewFileKey]: enable,
			}),
			// TODO this option shouldn't live here - this options object is global to the container
			// and not specific to the individual dataStoreRuntime.
			options: {
				attribution: {
					track: enable,
				},
			} as any,
		},
	});

	const getAttributorFromContainer = async (container: IContainer) => {
		const dataStore = (await container.getEntryPoint()) as ITestFluidObject;
		const containerRuntime = dataStore.context.containerRuntime as ContainerRuntime;
		const attributor = await getRuntimeAttributor(containerRuntime);
		assert(attributor !== undefined, "Attributor should be defined");
		return attributor;
	};

	/**
	 * Tracked by AB#4997, if no error event is detected within one sprint, we will remove
	 * the skipping or take actions accordingly if it is.
	 */
	itSkipsFailureOnSpecificDrivers(
		"Can attribute content from multiple collaborators",
		["tinylicious", "t9s"],
		async function () {
			// Skip tests for r11s drivers due to timeout issues because of certain network calls
			// taking longer time and this test has nothing to do with r11s driver.
			if (provider.driver.type === "r11s" || provider.driver.type === "routerlicious") {
				this.skip();
			}
			const container1 = await provider.makeTestContainer(getTestConfig(true));
			const sharedCell1 = await sharedCellFromContainer(container1);
			const container2 = await provider.loadTestContainer(getTestConfig(true));
			const sharedCell2 = await sharedCellFromContainer(container2);

			const attributor1 = await getAttributorFromContainer(container1);
			const attributor2 = await getAttributorFromContainer(container2);
			sharedCell1.set(1);
			assertAttributionMatches(sharedCell1, attributor1, "local");
			await provider.ensureSynchronized();

			sharedCell2.set(2);
			await provider.ensureSynchronized();

			assert(
				container1.clientId !== undefined && container2.clientId !== undefined,
				"Both containers should have client ids.",
			);
			assertAttributionMatches(sharedCell1, attributor1, {
				user: container1.audience.getMember(container2.clientId)?.user,
			});

			assertAttributionMatches(sharedCell2, attributor2, {
				user: container1.audience.getMember(container2.clientId)?.user,
			});
			sharedCell1.set(3);
			await provider.ensureSynchronized();

			assertAttributionMatches(sharedCell1, attributor1, {
				user: container2.audience.getMember(container1.clientId)?.user,
			});
			assertAttributionMatches(sharedCell2, attributor2, {
				user: container2.audience.getMember(container1.clientId)?.user,
			});
		},
	);

	it("attributes content created in a detached state", async function () {
		// Skip tests for r11s drivers due to timeout issues because of certain network calls
		// taking longer time and this test has nothing to do with r11s driver.
		if (provider.driver.type === "r11s" || provider.driver.type === "routerlicious") {
			this.skip();
		}
		const loader = provider.makeTestLoader(getTestConfig(true));
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container1 = await loader.createDetachedContainer(defaultCodeDetails);
		const sharedCell1 = await sharedCellFromContainer(container1);

		sharedCell1.set(1);
		const attributor1 = await getAttributorFromContainer(container1);
		assertAttributionMatches(sharedCell1, attributor1, "detached");

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

		assertAttributionMatches(sharedCell1, attributor1, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
	});
});
