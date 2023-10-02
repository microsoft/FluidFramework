/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../../map";
import { IMapOperation } from "../../mapKernel";
import { MapLocalOpMetadata } from "../../internalInterfaces";
import { ISharedMap } from "../../interfaces";

export function createConnectedMap(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): SharedMap {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const map = new SharedMap(id, dataStoreRuntime, MapFactory.Attributes);
	map.connect(services);
	return map;
}

export function createLocalMap(id: string): SharedMap {
	const map = new SharedMap(id, new MockFluidDataStoreRuntime(), MapFactory.Attributes);
	return map;
}

export class TestSharedMap extends SharedMap {
	public testApplyStashedOp(content: IMapOperation): MapLocalOpMetadata {
		return this.applyStashedOp(content) as MapLocalOpMetadata;
	}
}

export function assertMapsAreEquivalent(a: ISharedMap, b: ISharedMap) {
	assert.equal(a.size, b.size, `${a.id} and ${b.id} have different number of keys.`);
	for (const key of a.keys()) {
		const aVal = a.get(key);
		const bVal = b.get(key);
		assert.equal(aVal, bVal, `${a.id} and ${b.id} differ at ${key}: ${aVal} vs ${bVal}`);
	}
}
