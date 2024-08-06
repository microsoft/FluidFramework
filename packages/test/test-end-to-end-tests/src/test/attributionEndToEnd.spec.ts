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
import { IContainer, IFluidCodeDetails } from "@fluidframework/container-definitions/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { createInsertOnlyAttributionPolicy } from "@fluidframework/merge-tree/internal";
import { AttributionInfo } from "@fluidframework/runtime-definitions/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	ITestContainerConfig,
	ITestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils/internal";

const stringId = "sharedStringKey";

function assertAttributionMatches(
	sharedString: SharedString,
	position: number,
	attributor: IRuntimeAttributor,
	expected: Partial<AttributionInfo> | "detached" | "local" | undefined,
): void {
	const { segment, offset } = sharedString.getContainingSegment(position);
	assert(
		segment !== undefined && offset !== undefined,
		`Position ${position} had no associated segment.`,
	);
	assert(
		segment.attribution !== undefined,
		`Position ${position}'s segment had no attribution information.`,
	);
	const key = segment.attribution.getAtOffset(offset);

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

// TODO: Expand the e2e tests in this suite to cover interesting combinations of configuration and versioning that aren't covered by mixinAttributor
// unit tests.
describeCompat("Attributor", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
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

	const sharedStringFromContainer = async (container: IContainer) => {
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		return dataObject.getSharedObject<SharedString>(stringId);
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
					policyFactory: createInsertOnlyAttributionPolicy,
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
		async () => {
			const container1 = await provider.makeTestContainer(getTestConfig(true));
			const sharedString1 = await sharedStringFromContainer(container1);
			const container2 = await provider.loadTestContainer(getTestConfig(true));
			const sharedString2 = await sharedStringFromContainer(container2);

			const attributor1 = await getAttributorFromContainer(container1);

			const text = "client 1";
			sharedString1.insertText(0, text);
			assertAttributionMatches(sharedString1, 3, attributor1, "local");
			await provider.ensureSynchronized();
			sharedString2.insertText(0, "client 2, ");
			await provider.ensureSynchronized();
			assert.equal(sharedString1.getText(), "client 2, client 1");

			const attributor2 = await getAttributorFromContainer(container2);

			assert(
				container1.clientId !== undefined && container2.clientId !== undefined,
				"Both containers should have client ids.",
			);
			assertAttributionMatches(sharedString1, 3, attributor1, {
				user: container1.audience.getMember(container2.clientId)?.user,
			});
			assertAttributionMatches(sharedString1, 13, attributor1, {
				user: container1.audience.getMember(container1.clientId)?.user,
			});
			assertAttributionMatches(sharedString2, 3, attributor2, {
				user: container1.audience.getMember(container2.clientId)?.user,
			});
			assertAttributionMatches(sharedString2, 13, attributor2, {
				user: container1.audience.getMember(container1.clientId)?.user,
			});
		},
	);

	it("attributes content created in a detached state", async () => {
		const loader = provider.makeTestLoader(getTestConfig(true));
		const defaultCodeDetails: IFluidCodeDetails = {
			package: "defaultTestPackage",
			config: {},
		};
		const container1 = await loader.createDetachedContainer(defaultCodeDetails);
		const sharedString1 = await sharedStringFromContainer(container1);

		const text = "client 1";
		sharedString1.insertText(0, text);
		await container1.attach(provider.driver.createCreateNewRequest("doc id"));
		await provider.ensureSynchronized();

		const url = await container1.getAbsoluteUrl("");
		assert(url !== undefined);
		const loader2 = provider.makeTestLoader(getTestConfig(true));
		const container2 = await loader2.resolve({ url });

		const sharedString2 = await sharedStringFromContainer(container2);
		sharedString2.insertText(0, "client 2, ");

		await provider.ensureSynchronized();
		assert.equal(sharedString1.getText(), "client 2, client 1");

		assert(
			container1.clientId !== undefined && container2.clientId !== undefined,
			"Both containers should have client ids.",
		);
		const attributor = await getAttributorFromContainer(container1);
		assertAttributionMatches(sharedString1, 3, attributor, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
		assertAttributionMatches(sharedString1, 13, attributor, "detached");

		const attributor2 = await getAttributorFromContainer(container2);
		assertAttributionMatches(sharedString2, 3, attributor2, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
		assertAttributionMatches(sharedString2, 13, attributor2, "detached");
	});
});
