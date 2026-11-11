/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import {
	computeTombstoneTimeout,
	defaultSessionExpiryDurationMs,
	defaultSweepGracePeriodMs,
} from "@fluidframework/container-runtime/internal/test/gc";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ISharedMap } from "@fluidframework/map/internal";
import { channelsTreeName } from "@fluidframework/runtime-definitions/internal";
import {
	createSummarizer,
	getContainerEntryPointBackCompat,
	getRequiredPendingLocalState,
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import { type SinonFakeTimers, stub, useFakeTimers } from "sinon";

import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	manufactureHandle,
} from "./gcTestSummaryUtils.js";

describeCompat("GC DDS collection", "NoCompat", function (getTestObjectProvider, apis) {
	const { SharedMap } = apis.dds;
	const tombstoneTimeout = computeTombstoneTimeout(defaultSessionExpiryDurationMs);
	assert(tombstoneTimeout !== undefined);
	const sweepTimeout = tombstoneTimeout + defaultSweepGracePeriodMs;
	this.timeout(this.timeout() + sweepTimeout);

	let provider: ITestObjectProvider;
	let clock: SinonFakeTimers;
	const config: ITestContainerConfig = {
		runtimeOptions: {
			gcOptions: { enableDDSGC: true, enableGCSweep: true, inactiveTimeoutMs: 0 },
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	};

	before(() => {
		clock = useFakeTimers({ shouldAdvanceTime: true });
	});
	beforeEach(function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});
	afterEach(() => {
		clock.reset();
	});
	after(() => {
		clock.restore();
	});

	async function summarize(dataStore: ITestDataObject) {
		await provider.ensureSynchronized();
		return (dataStore._context.containerRuntime as ContainerRuntime).summarize({
			runGC: true,
			fullTree: true,
			trackState: false,
		});
	}

	it("roots named DDSs but not anonymous DDSs merely attached to a live data store", async () => {
		const container = await provider.makeTestContainer(config);
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const named = SharedMap.create(owner._runtime, "d655ac3e-381b-4dcc-a923-0bd83834df09");
		const anonymous = SharedMap.create(owner._runtime);
		named.bindToContext();
		anonymous.bindToContext();

		const { summary } = await summarize(owner);
		const gcState = getGCStateFromSummary(summary);
		assert(gcState !== undefined);
		assert.equal(
			gcState.gcNodes[`/${owner._context.id}/${named.id}`].unreferencedTimestampMs,
			undefined,
		);
		assert.equal(
			typeof gcState.gcNodes[`/${owner._context.id}/${anonymous.id}`].unreferencedTimestampMs,
			"number",
		);
		const dataStores = summary.tree[channelsTreeName];
		assert(dataStores.type === SummaryType.Tree);
		const ownerSummary = dataStores.tree[owner._context.id];
		assert(ownerSummary.type === SummaryType.Tree);
		const channels = ownerSummary.tree[channelsTreeName];
		assert(channels.type === SummaryType.Tree);
		const anonymousSummary = channels.tree[anonymous.id];
		assert(anonymousSummary.type === SummaryType.Tree);
		assert.equal(anonymousSummary.unreferenced, true);
	});

	it("does not collect anonymous DDSs in legacy documents", async () => {
		const legacyConfig: ITestContainerConfig = {
			runtimeOptions: {
				...config.runtimeOptions,
				gcOptions: { enableGCSweep: true, inactiveTimeoutMs: 0 },
			},
		};
		const container = await provider.makeTestContainer(legacyConfig);
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const anonymous = SharedMap.create(owner._runtime);
		anonymous.bindToContext();
		const { summary } = await summarize(owner);
		const state = getGCStateFromSummary(summary);
		assert(state !== undefined);
		assert.equal(
			state.gcNodes[`/${owner._context.id}/${anonymous.id}`].unreferencedTimestampMs,
			undefined,
		);
	});

	it("blocks use and ID reuse of a loaded DDS deleted in GC test mode", async () => {
		const container = await provider.makeTestContainer({
			runtimeOptions: {
				...config.runtimeOptions,
				gcOptions: { ...config.runtimeOptions?.gcOptions, runGCInTestMode: true },
			},
		});
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const anonymous = SharedMap.create(owner._runtime);
		owner._root.set("anonymous", anonymous.handle);
		owner._root.delete("anonymous");
		await summarize(owner);
		await assert.rejects(owner._runtime.getChannel(anonymous.id), /deleted/);
		assert.throws(() => anonymous.set("late", "operation"), /deleted/);
		assert.throws(
			() => owner._runtime.createChannel(anonymous.id, SharedMap.getFactory().type),
			/deleted/,
		);
	});

	it("retains transitive references and resets the age of a DDS revived between GC runs", async () => {
		const container = await provider.makeTestContainer(config);
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const first = SharedMap.create(owner._runtime);
		const second = SharedMap.create(owner._runtime);
		first.set("child", second.handle);
		second.set("cycle", first.handle);
		owner._root.set("first", first.handle);

		let result = await summarize(owner);
		const firstPath = `/${owner._context.id}/${first.id}`;
		const secondPath = `/${owner._context.id}/${second.id}`;
		let state = getGCStateFromSummary(result.summary);
		assert(state !== undefined);
		assert.equal(state.gcNodes[firstPath].unreferencedTimestampMs, undefined);
		assert.equal(state.gcNodes[secondPath].unreferencedTimestampMs, undefined);

		owner._root.delete("first");
		result = await summarize(owner);
		state = getGCStateFromSummary(result.summary);
		assert(state !== undefined);
		const oldTimestamp = state.gcNodes[secondPath].unreferencedTimestampMs;
		assert(oldTimestamp !== undefined);

		clock.tick(10);
		owner._root.set("first", first.handle);
		owner._root.delete("first");
		result = await summarize(owner);
		state = getGCStateFromSummary(result.summary);
		assert(state !== undefined);
		const newTimestamp = state.gcNodes[secondPath].unreferencedTimestampMs;
		assert(newTimestamp !== undefined && newTimestamp > oldTimestamp);
	});

	it("retains a DDS when only one of its internal GC nodes is referenced", async () => {
		const container = await provider.makeTestContainer(config);
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const anonymous = SharedMap.create(owner._runtime);
		owner._root.set("anonymous", anonymous.handle);
		await provider.ensureSynchronized();

		// Model a DDS that exposes separately addressable GC nodes.
		const gcData = stub(anonymous, "getGCData").returns({
			gcNodes: { "/": [], "/inner": [] },
		});
		try {
			owner._root.delete("anonymous");
			const ddsPath = `/${owner._context.id}/${anonymous.id}`;
			owner._root.set(
				"inner",
				manufactureHandle(owner._context.IFluidHandleContext, `${ddsPath}/inner`),
			);
			const { summary } = await summarize(owner);
			const state = getGCStateFromSummary(summary);
			assert(state !== undefined);
			assert.equal(state.gcNodes[ddsPath].unreferencedTimestampMs, undefined);
			assert.equal(state.gcNodes[`${ddsPath}/inner`].unreferencedTimestampMs, undefined);
		} finally {
			gcData.restore();
		}
	});

	it("persists roots and opt-in and sweeps only the unreachable DDS after reload", async () => {
		const container = await provider.makeTestContainer(config);
		const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const named = SharedMap.create(owner._runtime, "named");
		named.bindToContext();
		const anonymous = SharedMap.create(owner._runtime);
		owner._root.set("anonymous", anonymous.handle);
		owner._root.delete("anonymous");
		await provider.ensureSynchronized();
		const { summarizer, container: summarizerContainer } = await createSummarizer(
			provider,
			container,
			{ runtimeOptions: { gcOptions: config.runtimeOptions?.gcOptions } },
		);
		const { summaryVersion } = await summarizeNow(summarizer);
		container.close();
		summarizerContainer.close();
		clock.tick(sweepTimeout + 10);

		// Loading without enableDDSGC must retain the document's persisted choice.
		const loadConfig: ITestContainerConfig = {
			runtimeOptions: {
				...config.runtimeOptions,
				gcOptions: { enableGCSweep: true, inactiveTimeoutMs: 0 },
			},
		};
		const loaded = await provider.loadTestContainer(loadConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const loadedOwner = await getContainerEntryPointBackCompat<ITestDataObject>(loaded);
		assert.equal((await loadedOwner._runtime.getChannel(named.id)).id, named.id);
		loadedOwner._root.set("timestamp", "advance");
		await summarize(loadedOwner);
		await provider.ensureSynchronized();
		const { summary } = await summarize(loadedOwner);
		const deletedPath = `/${owner._context.id}/${anonymous.id}`;
		assert(getGCDeletedStateFromSummary(summary)?.includes(deletedPath));
		await assert.rejects(loadedOwner._runtime.getChannel(anonymous.id), /deleted/);
		assert.equal((await loadedOwner._runtime.getChannel(named.id)).id, named.id);
		assert.throws(
			() => loadedOwner._runtime.createChannel(anonymous.id, SharedMap.getFactory().type),
			/deleted/,
		);
	});

	for (const createWhileOffline of [false, true]) {
		it(`preserves DDS roots through pending state with pending attach ${createWhileOffline}`, async () => {
			const container = await provider.makeTestContainer(config);
			await waitForContainerConnection(container);
			const owner = await getContainerEntryPointBackCompat<ITestDataObject>(container);
			if (createWhileOffline) {
				await provider.opProcessingController.pauseProcessing(container);
			}
			const anonymous = SharedMap.create(owner._runtime);
			const named = SharedMap.create(owner._runtime, "pending-root");
			named.bindToContext();
			owner._root.set("anonymous", anonymous.handle);
			if (!createWhileOffline) {
				await provider.ensureSynchronized();
				await provider.opProcessingController.pauseProcessing(container);
			}
			anonymous.set("pending", "value");
			const pending = await getRequiredPendingLocalState(container);
			const url = await container.getAbsoluteUrl("");
			assert(url !== undefined);
			container.close();
			provider.opProcessingController.resumeProcessing();
			const restored = await provider.makeTestLoader(config).resolve({ url }, pending);
			await waitForContainerConnection(restored);
			await provider.ensureSynchronized();
			const restoredOwner = await getContainerEntryPointBackCompat<ITestDataObject>(restored);
			const restoredMap = (await restoredOwner._runtime.getChannel(
				anonymous.id,
			)) as ISharedMap;
			assert.equal(restoredMap.get("pending"), "value");
			assert.equal((await restoredOwner._runtime.getChannel(named.id)).id, named.id);
			const { summary } = await summarize(restoredOwner);
			const state = getGCStateFromSummary(summary);
			assert(state !== undefined);
			assert.equal(
				state.gcNodes[`/${owner._context.id}/${named.id}`].unreferencedTimestampMs,
				undefined,
			);
		});
	}
});
