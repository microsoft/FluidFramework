/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IChannel,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
	MockContainerRuntimeFactory,
} from "@fluidframework/test-runtime-utils/internal";

/**
 * @internal
 */
export type DDSCreator<T extends IChannel> = (
	runtime: MockFluidDataStoreRuntime,
	id: string,
) => T;

/**
 * @internal
 */
export interface RollbackTestSetup<T extends IChannel> {
	dds: T;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}

/**
 * Setup rollback tests
 * @internal
 */
export function setupRollbackTest<T extends IChannel>(
	id: string,
	createDDS: DDSCreator<T>,
	opts?: { initialize?: (dds: T) => void },
): RollbackTestSetup<T> {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 });
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);

	const dds = createDDS(dataStoreRuntime, id);

	dataStoreRuntime.setAttachState(AttachState.Attached);
	opts?.initialize?.(dds);

	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	dds.connect(services);

	return { dds, dataStoreRuntime, containerRuntimeFactory, containerRuntime };
}

/**
 * Create a new client
 * @internal
 */
export function createAdditionalClient<T extends IChannel>(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string,
	createDDS: DDSCreator<T>,
	opts?: { initialize?: (dds: T) => void },
): {
	dds: T;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);

	const dds = createDDS(dataStoreRuntime, id);

	dataStoreRuntime.setAttachState(AttachState.Attached);
	opts?.initialize?.(dds);

	const services: IChannelServices = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	dds.connect(services);

	return { dds, dataStoreRuntime, containerRuntime };
}
