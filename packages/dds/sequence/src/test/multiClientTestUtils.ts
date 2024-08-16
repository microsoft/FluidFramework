/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntimeFactoryForReconnection,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedString } from "../sequenceFactory.js";
import { type ISharedString } from "../sharedString.js";

import { Client } from "./intervalTestUtils.js";

export function constructClient(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	id: string,
	dataStoreRuntimeOptions: Record<string | number, any> = {
		intervalStickinessEnabled: true,
		mergeTreeEnableObliterate: true,
		mergeTreeEnableObliterateReconnect: true,
	},
	factory = SharedString.getFactory(),
) {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	dataStoreRuntime.options = dataStoreRuntimeOptions;
	const sharedString: ISharedString = factory.create(dataStoreRuntime, id);
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	sharedString.initializeLocal();

	return {
		sharedString,
		containerRuntime,
		services,
	};
}

export async function loadClient(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	source: Client,
	id: string,
	dataStoreRuntimeOptions: Record<string | number, any> = {
		intervalStickinessEnabled: true,
		mergeTreeEnableObliterate: true,
	},
	factory = SharedString.getFactory(),
): Promise<Client> {
	const { summary } = source.sharedString.getAttachSummary();

	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	dataStoreRuntime.options = dataStoreRuntimeOptions;
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: MockStorage.createFromSummary(summary),
	};
	const sharedString = await factory.load(dataStoreRuntime, id, services, factory.attributes);

	return {
		sharedString,
		containerRuntime,
	};
}

export function constructClients(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	numClients = 3,
	dataStoreRuntimeOptions?: Record<string | number, any>,
	factory = SharedString.getFactory(),
): Client[] {
	return Array.from({ length: numClients }, (_, index) => {
		const { sharedString, containerRuntime, services } = constructClient(
			containerRuntimeFactory,
			String.fromCharCode(index + 65),
			dataStoreRuntimeOptions,
			factory,
		);

		sharedString.connect(services);
		return { containerRuntime, sharedString };
	});
}
