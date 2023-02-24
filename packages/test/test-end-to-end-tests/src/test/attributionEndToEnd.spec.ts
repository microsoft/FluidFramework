/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AttributionInfo,
	createRuntimeAttributor,
	enableOnNewFileKey,
	IRuntimeAttributor,
} from "@fluidframework/attributor";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

const stringId = "sharedStringKey";
const registry: ChannelFactoryRegistry = [[stringId, SharedString.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

function assertAttributionMatches(
	sharedString: SharedString,
	position: number,
	attributor: IRuntimeAttributor,
	expected: Partial<AttributionInfo>,
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
	const { timestamp, user } = attributor.get(key) ?? {};
	if (expected.timestamp !== undefined) {
		assert.equal(timestamp, expected.timestamp);
	}
	if (expected.user !== undefined) {
		assert.deepEqual(user, expected.user);
	}
}

// TODO: Expand the e2e tests in this suite to cover interesting combinations of configuration and versioning that aren't covered by mixinAttributor
// unit tests.
describeNoCompat("Attributor", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	it("Can attribute content from multiple collaborators", async () => {
		const sharedStringFromContainer = async (container: IContainer) => {
			const dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
			return dataObject.getSharedObject<SharedString>(stringId);
		};

		const getTestConfig = (runtimeAttributor?: IRuntimeAttributor): ITestContainerConfig => ({
			...testContainerConfig,
			enableAttribution: runtimeAttributor !== undefined,
			loaderProps: {
				scope: { IRuntimeAttributor: runtimeAttributor },
				configProvider: configProvider({
					[enableOnNewFileKey]: true,
				}),
			},
		});

		const attributor = createRuntimeAttributor();
		const container1 = await provider.makeTestContainer(getTestConfig(attributor));
		const sharedString1 = await sharedStringFromContainer(container1);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const sharedString2 = await sharedStringFromContainer(container2);

		const text = "client 1";
		sharedString1.insertText(0, text);
		await provider.ensureSynchronized();
		sharedString2.insertText(0, "client 2, ");
		await provider.ensureSynchronized();
		assert.equal(sharedString1.getText(), "client 2, client 1");

		assert(
			container1.clientId !== undefined && container2.clientId !== undefined,
			"Both containers should have client ids.",
		);
		assertAttributionMatches(sharedString1, 3, attributor, {
			user: container1.audience.getMember(container2.clientId)?.user,
		});
		assertAttributionMatches(sharedString1, 13, attributor, {
			user: container1.audience.getMember(container1.clientId)?.user,
		});
	});
});
