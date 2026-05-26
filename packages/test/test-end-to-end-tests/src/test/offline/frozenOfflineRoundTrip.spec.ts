/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type { IContainer, IHostLoader } from "@fluidframework/container-definitions/internal";
import {
	captureFullContainerState,
	loadFrozenContainerFromPendingState,
} from "@fluidframework/container-loader/internal";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map/internal";
import {
	ChannelFactoryRegistry,
	DataObjectFactoryType,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	LocalCodeLoader,
	createAndAttachContainer,
	getRequiredPendingLocalState,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

const mapId = "map";

// Driver-agnostic e2e test for the full offline-capture round-trip:
//
//   captureFullContainerState (online, driver-backed)
//     → loadFrozenContainerFromPendingState (offline, no driver wiring)
//     → local edits on the offline container
//     → getPendingLocalState (re-capture, includes offline edits)
//     → loader.resolve (online resume, driver-backed)
//
// Validates that ops authored against a fully-offline frozen container
// survive a re-capture and are replayed correctly when the layered
// pending state is reloaded with real driver wiring. ODSP is the driver
// of primary interest, but the test runs against whichever driver the
// e2e suite selects.
describeCompat(
	"frozen container offline round-trip",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap } = apis.dds;
		const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];

		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
			runtimeOptions: {
				summaryOptions: {
					summaryConfigOverrides: { state: "disabled" },
				},
			},
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineFull": true,
				}),
			},
		};

		let provider: ITestObjectProvider;
		let url: string;
		let loader: IHostLoader;
		let container1: IContainer;
		let map1: ISharedMap;

		beforeEach("setup", async () => {
			provider = getTestObjectProvider();
			loader = provider.makeTestLoader(testContainerConfig);
			container1 = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container1.resolvedUrl);
			const absUrl = await container1.getAbsoluteUrl("");
			assert(absUrl !== undefined, "Expected container to provide an absolute URL");
			url = absUrl;
			const dataStore1 = (await container1.getEntryPoint()) as ITestFluidObject;
			map1 = await dataStore1.getSharedObject<ISharedMap>(mapId);
		});

		it("captureFullContainerState → offline writable load → re-capture → online resume", async () => {
			// Baseline edit synced through the driver so captureFullContainerState
			// sees it in the snapshot it pulls.
			map1.set("baseline", "value");
			await provider.ensureSynchronized();

			// 1. Driver-side capture — produces a self-contained pending state
			//    that does not require driver wiring to rehydrate.
			const capturedFullState = await captureFullContainerState({
				urlResolver: provider.urlResolver,
				documentServiceFactory: provider.documentServiceFactory,
				request: { url },
			});

			// 2. Offline writable load — no urlResolver, no documentServiceFactory,
			//    no request. readOnly: false to accept local edits.
			const codeLoader = new LocalCodeLoader([
				[provider.defaultCodeDetails, provider.createFluidEntryPoint(testContainerConfig)],
			]);
			const offlineContainer = await loadFrozenContainerFromPendingState({
				codeLoader,
				pendingLocalState: capturedFullState,
				readOnly: false,
			});
			const offlineEntry = (await offlineContainer.getEntryPoint()) as ITestFluidObject;
			const offlineMap = await offlineEntry.getSharedObject<ISharedMap>(mapId);
			assert.strictEqual(
				offlineMap.get("baseline"),
				"value",
				"Expected offline container to reflect baseline edit captured before going offline",
			);

			// 3. Local edits on the offline container — these must accumulate
			//    without contacting the service.
			for (let i = 0; i < 5; i++) {
				offlineMap.set(`offline-${i}`, i);
			}

			// 4. Re-capture pending state from the offline container. The
			//    load-bearing invariant: edits authored post-offline-load must
			//    round-trip through getPendingLocalState() even when the driver
			//    wiring underneath is fully synthesized.
			const layeredPending = await getRequiredPendingLocalState(offlineContainer);
			offlineContainer.close();

			// 5. Online resume — same loader (real driver wiring) but with the
			//    layered pending state from the offline session.
			const resumed = await loader.resolve({ url }, layeredPending);
			await waitForContainerConnection(resumed);
			await provider.ensureSynchronized();

			// 6. The offline edits must surface on the original online container
			//    once the resumed container replays its pending ops to the service.
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(
					map1.get(`offline-${i}`),
					i,
					`Expected original container to observe offline-${i} after online resume replayed the pending ops`,
				);
			}

			const resumedEntry = (await resumed.getEntryPoint()) as ITestFluidObject;
			const resumedMap = await resumedEntry.getSharedObject<ISharedMap>(mapId);
			assert.strictEqual(
				resumedMap.get("baseline"),
				"value",
				"Expected resumed container to retain baseline edit",
			);
			for (let i = 0; i < 5; i++) {
				assert.strictEqual(
					resumedMap.get(`offline-${i}`),
					i,
					`Expected resumed container to observe offline-${i}`,
				);
			}
		});
	},
);
