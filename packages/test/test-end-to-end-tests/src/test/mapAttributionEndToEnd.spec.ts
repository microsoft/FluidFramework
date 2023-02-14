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
} from "@fluidframework/attributor";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { SharedMap } from "@fluidframework/map";

const mapId = "sharedMapKey";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

function assertAttributionMatches(
	sharedMap: SharedMap,
	mapKey: string,
	attributor: IRuntimeAttributor,
	expected: Partial<AttributionInfo> | "detached",
): void {
	const key = sharedMap.getAttribution(mapKey);

	if (expected === "detached") {
		assert(
			key === undefined,
			`The attribuiton should not be recorded in detached state currently`,
		);
	} else {
		assert(key !== undefined, `The entry with key ${mapKey} had no attribution information`);
		const { timestamp, user } = attributor.get(key) ?? {};
		if (expected.timestamp !== undefined) {
			assert.equal(timestamp, expected.timestamp);
		}
		if (expected.user !== undefined) {
			assert.deepEqual(user, expected.user);
		}
	}
}

describeNoCompat("Attributor for SharedMap", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const sharedMapFromContainer = async (container: IContainer) => {
		const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		return dataObject.getSharedObject<SharedMap>(mapId);
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

	it("Can attribute content from multiple collaborators", async () => {
		const attributor = createRuntimeAttributor();
		const container1 = await provider.makeTestContainer(getTestConfig(attributor));
		const sharedMap1 = await sharedMapFromContainer(container1);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const sharedMap2 = await sharedMapFromContainer(container2);

		sharedMap1.set("key1", 1);
		await provider.ensureSynchronized();
		sharedMap1.set("key2", 2);
		await provider.ensureSynchronized();
		sharedMap2.set("key1", 3);
		await provider.ensureSynchronized();

		assert.equal(sharedMap1.get("key1"), 3);
		assert.equal(sharedMap1.get("key2"), 2);
		assert.equal(sharedMap2.get("key1"), 3);
		assert.equal(sharedMap2.get("key2"), 2);

		assert(
			container1.clientId !== undefined && container2.clientId !== undefined,
			"Both containers should have client ids.",
		);
		assertAttributionMatches(sharedMap1, "key1", attributor, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
		assertAttributionMatches(sharedMap1, "key2", attributor, {
			user: container2.audience.getMember(container1.clientId)?.user,
		});
	});

	it("attributes content created in a detached state", async () => {
		const attributor = createRuntimeAttributor();
		const loader = provider.makeTestLoader(getTestConfig(attributor));
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container1 = await loader.createDetachedContainer(defaultCodeDetails);
		const sharedMap1 = await sharedMapFromContainer(container1);

		sharedMap1.set("key1", 1);
		sharedMap1.set("key2", 2);
		await container1.attach(provider.driver.createCreateNewRequest("doc id"));
		await provider.ensureSynchronized();

		provider.updateDocumentId(container1.resolvedUrl);
		const container2 = await provider.loadTestContainer(getTestConfig());
		const sharedMap2 = await sharedMapFromContainer(container2);
		sharedMap2.set("key1", 3);

		await provider.ensureSynchronized();

		assert(
			container1.clientId !== undefined && container2.clientId !== undefined,
			"Both containers should have client ids.",
		);
		assertAttributionMatches(sharedMap1, "key1", attributor, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
		assertAttributionMatches(sharedMap1, "key2", attributor, "detached");
	});
});
