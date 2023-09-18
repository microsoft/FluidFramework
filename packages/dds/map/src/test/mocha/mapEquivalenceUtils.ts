/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ISharedMap } from "../../interfaces";
import { MapFactory, SharedMap } from "../../map";

export interface MapClient {
	sharedMap: ISharedMap;
	containerRuntime: MockContainerRuntimeForReconnection;
}

export function constructInitialClients(
	containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection,
	numClients = 3,
): MapClient[] {
	return Array.from({ length: numClients }, (_, index) => {
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		const sharedMap = new SharedMap(
			String.fromCharCode(index + 65),
			dataStoreRuntime,
			MapFactory.Attributes,
		);
		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services = {
			deltaConnection: dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		sharedMap.connect(services);

		return { sharedMap, containerRuntime };
	}) as MapClient[];
}

export function addMapClient(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
	clients: MapClient[],
): void {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const sharedMap = new SharedMap(id, dataStoreRuntime, MapFactory.Attributes);
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	sharedMap.connect(services);
	const newClient = { sharedMap, containerRuntime };
	clients.push(newClient);
}

export function assertMapClientConsistent(clients: MapClient[]): void {
	const connectedClients = clients.filter((client) => client.containerRuntime.connected);
	if (connectedClients.length < 2) {
		// No two strings are expected to be consistent.
		return;
	}
	const first = connectedClients[0].sharedMap;
	for (const { sharedMap: other } of connectedClients.slice(1)) {
		assertEquivalentSharedMaps(first, other);
	}
}

export function assertEquivalentSharedMaps(a: ISharedMap, b: ISharedMap) {
	assert.equal(a.size, b.size, `${a.id} and ${b.id} have different number of keys.`);
	for (const key of a.keys()) {
		const aVal = a.get(key);
		const bVal = b.get(key);
		assert.equal(aVal, bVal, `${a.id} and ${b.id} differ at ${key}: ${aVal} vs ${bVal}`);
	}
}
