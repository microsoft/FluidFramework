/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../../map";
import { IMapOperation } from "../../mapKernel";
import { MapLocalOpMetadata } from "../../internalInterfaces";

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
