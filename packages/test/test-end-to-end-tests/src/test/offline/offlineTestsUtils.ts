/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerExperimental } from "@fluidframework/container-loader/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { toDeltaManagerInternal } from "@fluidframework/runtime-utils/internal";
import {
	type ITestFluidObject,
	type ITestContainerConfig,
	type ITestObjectProvider,
	waitForContainerConnection,
	toIDeltaManagerFull,
} from "@fluidframework/test-utils/internal";

import { wrapObjectAndOverride } from "../../mocking.js";

type SharedObjCallback = (
	container: IContainer,
	dataStore: ITestFluidObject,
) => void | Promise<void>;

/**
 * load container, pause, create (local) ops from callback, then optionally send ops before closing container
 */
export const getPendingOps = async (
	testContainerConfig: ITestContainerConfig,
	testObjectProvider: ITestObjectProvider,
	send: false | true | "afterReconnect",
	cb: SharedObjCallback = () => undefined,
) => {
	const container: IContainerExperimental =
		await testObjectProvider.loadTestContainer(testContainerConfig);
	await waitForContainerConnection(container);
	const dataStore = (await container.getEntryPoint()) as ITestFluidObject;

	const lots = 30;
	[...Array(lots).keys()].map((i) =>
		dataStore.root.set(`make sure csn is > 1 so it doesn't hide bugs ${i}`, i),
	);

	await testObjectProvider.ensureSynchronized();
	await testObjectProvider.opProcessingController.pauseProcessing(container);
	const deltaManagerInternal = toIDeltaManagerFull(
		toDeltaManagerInternal(dataStore.runtime.deltaManager),
	);
	assert(deltaManagerInternal.outbound.paused);

	await cb(container, dataStore);

	let pendingState: string | undefined;
	if (send === true) {
		pendingState = await container.getPendingLocalState?.();
		await testObjectProvider.ensureSynchronized(); // Note: This will resume processing to get synchronized
		container.close();
	} else if (send === "afterReconnect") {
		pendingState = await container.getPendingLocalState?.();
		container.disconnect();
		container.connect();
		await testObjectProvider.ensureSynchronized(); // Note: This will have a different clientId than in pendingState
		container.close();
	} else {
		pendingState = await container.closeAndGetPendingLocalState?.();
	}

	testObjectProvider.opProcessingController.resumeProcessing();

	assert.ok(pendingState);
	return pendingState;
};

/**
 * Load a Container using testContainerConfig and the given testObjectProvider,
 * Deferring connection to the service until the returned connect function is called
 * (simulating returning from offline)
 *
 * @param testObjectProvider - For accessing Loader/Driver
 * @param request - Request to use when loading
 * @param pendingLocalState - (Optional) custom PendingLocalState to load from. Defaults to using getPendingOps helper if omitted.
 * @returns A container instance with a connect function to unblock the Driver (simulating coming back from offline)
 */
export async function loadOffline(
	testContainerConfig: ITestContainerConfig,
	testObjectProvider: ITestObjectProvider,
	request: IRequest,
	pendingLocalState?: string,
): Promise<{ container: IContainerExperimental; connect: () => void }> {
	const p = new Deferred();
	// This documentServiceFactory will wait for the promise p to resolve before connecting to the service
	const documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
		testObjectProvider.documentServiceFactory,
		{
			createDocumentService: {
				connectToDeltaStream: (ds) => async (client) => {
					await p.promise;
					return ds.connectToDeltaStream(client);
				},
				connectToDeltaStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToDeltaStorage();
				},
				connectToStorage: (ds) => async () => {
					await p.promise;
					return ds.connectToStorage();
				},
			},
		},
	);

	const loader = testObjectProvider.createLoader(
		[
			[
				testObjectProvider.defaultCodeDetails,
				testObjectProvider.createFluidEntryPoint(testContainerConfig),
			],
		],
		{ ...testContainerConfig.loaderProps, documentServiceFactory },
	);
	const container = await loader.resolve(
		request,
		pendingLocalState ??
			(await getPendingOps(testContainerConfig, testObjectProvider, false /* send */)),
	);
	return { container, connect: () => p.resolve(undefined) };
}
