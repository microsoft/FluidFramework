/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import type {
	IContainer,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	asLegacyAlpha as asLegacyAlphaContainer,
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { StageControlsAlpha } from "@fluidframework/runtime-definitions/internal";
import { asLegacyAlpha } from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

/**
 * Structural view of the runtime providing `isReadOnly()`. The base
 * IContainerRuntime interface doesn't surface this method directly, but the
 * concrete ContainerRuntime implementation does. We use this narrow view to
 * read the readonly state during the apply window without taking a class-level
 * dependency on ContainerRuntime in the test.
 */
type RuntimeWithReadOnly = IContainerRuntime & { readonly isReadOnly: () => boolean };

/**
 * Tracks the start/end events fired by the runtime during a pending-state load.
 * Captured by closure inside the runtime factory so the test can inspect after load.
 */
interface ApplyLifecycleObservations {
	startCount: number;
	endCount: number;
	/** True iff `runtime.isReadOnly()` returned true when `pendingStateApplyStart` fired. */
	wasReadOnlyAtStart: boolean;
	/** Captured during the start handler; undefined when the test opts not to enter staging mode. */
	stageControls: StageControlsAlpha | undefined;
}

class CountingDataObject extends DataObject {
	get CountingDataObject(): this {
		return this;
	}

	public set(key: string, value: unknown): void {
		this.root.set(key, value);
	}

	public get(key: string): unknown {
		return this.root.get(key);
	}

	public keys(): string[] {
		return [...this.root.keys()];
	}
}

const dataObjectFactory = new DataObjectFactory({
	type: "CountingDataObject",
	ctor: CountingDataObject,
});

/**
 * Build a runtime factory whose `provideEntryPoint` subscribes to the new
 * pendingStateApplyStart/End events and optionally enters staging mode in the start
 * handler. The closure-captured `observations` object lets the test inspect what fired.
 */
function createRuntimeFactory(
	observations: ApplyLifecycleObservations,
	options: { enterStagingModeOnStart: boolean },
): IRuntimeFactory {
	return {
		get IRuntimeFactory() {
			return this;
		},
		instantiateRuntime: async (context, existing) => {
			return loadContainerRuntime({
				context,
				existing,
				registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
				provideEntryPoint: async (rt: IContainerRuntime) => {
					const rtWithReadOnly = rt as RuntimeWithReadOnly;
					rt.on("pendingStateApplyStart", () => {
						observations.startCount += 1;
						observations.wasReadOnlyAtStart = rtWithReadOnly.isReadOnly();
						if (options.enterStagingModeOnStart) {
							observations.stageControls = asLegacyAlpha(rt).enterStagingMode();
						}
					});
					rt.on("pendingStateApplyEnd", () => {
						observations.endCount += 1;
					});

					const aliased = await rt.getAliasedDataStoreEntryPoint("default");
					if (aliased === undefined) {
						const ds = await rt.createDataStore(dataObjectFactory.type);
						await ds.trySetAlias("default");
						const created = await rt.getAliasedDataStoreEntryPoint("default");
						assert(created !== undefined, "default data store must exist");
						return created.get();
					}
					return aliased.get();
				},
			});
		},
	};
}

const newObservations = (): ApplyLifecycleObservations => ({
	startCount: 0,
	endCount: 0,
	wasReadOnlyAtStart: false,
	stageControls: undefined,
});

async function getDataObject(container: IContainer): Promise<CountingDataObject> {
	const entrypoint = (await container.getEntryPoint()) as Partial<CountingDataObject>;
	const dataObject = entrypoint.CountingDataObject;
	assert(dataObject !== undefined, "dataObject must be defined");
	return dataObject;
}

/**
 * Capture pending state from a fresh container that has stashed (offline) ops.
 * The returned `pendingState` carries the offline `set` calls; the snapshot reflects
 * only the server-acked ops that happened while connected.
 */
async function captureOfflinePendingState(
	deltaConnectionServer: ILocalDeltaConnectionServer,
	offlineEdits: Record<string, unknown>,
): Promise<{ pendingState: string; url: string }> {
	const observations = newObservations();
	const factory = createRuntimeFactory(observations, { enterStagingModeOnStart: false });
	const { codeDetails, urlResolver, loaderProps } = createLoader({
		deltaConnectionServer,
		runtimeFactory: factory,
	});

	const container = asLegacyAlphaContainer(
		await createDetachedContainer({ ...loaderProps, codeDetails }),
	);
	const dataObject = await getDataObject(container);
	dataObject.set("acked-while-attached", "value");

	await container.attach(urlResolver.createCreateNewRequest("apply-lifecycle-test"));
	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "url required");

	// Wait for the attach + initial set to be acked.
	await new Promise<void>((resolve) => {
		if (!container.isDirty) {
			resolve();
			return;
		}
		container.once("saved", () => resolve());
	});

	// Disconnect, then make offline edits — these become stashed ops.
	container.disconnect();
	for (const [k, v] of Object.entries(offlineEdits)) {
		dataObject.set(k, v);
	}

	const pendingState = await container.getPendingLocalState();
	container.close();
	return { pendingState, url };
}

describe("Pending state apply lifecycle", () => {
	it("does not fire events when there are no stashed ops to apply", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		// Capture pending state from a container that is *not* offline-dirty —
		// no stashed ops to replay, so the events should not fire.
		const observations = newObservations();
		const factory = createRuntimeFactory(observations, { enterStagingModeOnStart: false });
		const { codeDetails, urlResolver, loaderProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: factory,
		});

		const container = asLegacyAlphaContainer(
			await createDetachedContainer({ ...loaderProps, codeDetails }),
		);
		const dataObject = await getDataObject(container);
		dataObject.set("k", "v");
		await container.attach(urlResolver.createCreateNewRequest("no-stashed"));
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "url required");
		await new Promise<void>((resolve) =>
			container.isDirty ? container.once("saved", () => resolve()) : resolve(),
		);

		// No offline edits — pending state has no `initialMessages` to replay.
		const pendingState = await container.getPendingLocalState();
		container.close();

		const reloadObservations = newObservations();
		const reloadFactory = createRuntimeFactory(reloadObservations, {
			enterStagingModeOnStart: false,
		});
		const { loaderProps: reloadProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: reloadFactory,
		});
		const reloaded = await loadExistingContainer({
			...reloadProps,
			request: { url },
			pendingLocalState: pendingState,
		});
		await reloaded.getEntryPoint();

		assert.strictEqual(
			reloadObservations.startCount,
			0,
			"start event should not fire without stashed ops",
		);
		assert.strictEqual(
			reloadObservations.endCount,
			0,
			"end event should not fire without stashed ops",
		);
	});

	it("fires start/end events around the apply window when stashed ops exist", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { pendingState, url } = await captureOfflinePendingState(deltaConnectionServer, {
			"offline-key-1": "offline-value-1",
			"offline-key-2": "offline-value-2",
		});

		const observations = newObservations();
		const factory = createRuntimeFactory(observations, { enterStagingModeOnStart: false });
		const { loaderProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: factory,
		});

		const reloaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
			pendingLocalState: pendingState,
		});

		// Force the entrypoint to materialize so the lazy promise the runtime exposes
		// has been awaited. (Subscriptions registered inside provideEntryPoint must
		// be in place before pendingStateApplyStart fires; that's exactly what the
		// runtime guarantees by materializing the entrypoint inside the pre-apply hook.)
		const reloadedDataObject = await getDataObject(reloaded);

		assert.strictEqual(observations.startCount, 1, "start event fired exactly once");
		assert.strictEqual(observations.endCount, 1, "end event fired exactly once");
		assert.strictEqual(
			observations.wasReadOnlyAtStart,
			true,
			"runtime should be readonly during the apply window",
		);

		// And the offline edits are present after replay.
		assert.strictEqual(reloadedDataObject.get("offline-key-1"), "offline-value-1");
		assert.strictEqual(reloadedDataObject.get("offline-key-2"), "offline-value-2");
		assert.strictEqual(reloadedDataObject.get("acked-while-attached"), "value");
	});

	it("entering staging mode in the start handler stages un-acked replayed ops", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { pendingState, url } = await captureOfflinePendingState(deltaConnectionServer, {
			"offline-key": "offline-value",
		});

		const observations = newObservations();
		const factory = createRuntimeFactory(observations, { enterStagingModeOnStart: true });
		const { loaderProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: factory,
		});

		// Spawn an observer client to verify staged ops do not propagate before commit.
		const observerObservations = newObservations();
		const observerFactory = createRuntimeFactory(observerObservations, {
			enterStagingModeOnStart: false,
		});
		const { loaderProps: observerProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: observerFactory,
		});
		const observerContainer = await loadExistingContainer({
			...observerProps,
			request: { url },
		});
		const observerDataObject = await getDataObject(observerContainer);

		const reloaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
			pendingLocalState: pendingState,
		});
		const reloadedDataObject = await getDataObject(reloaded);

		assert.strictEqual(observations.startCount, 1, "start fired once");
		assert.strictEqual(observations.endCount, 1, "end fired once");
		assert.ok(observations.stageControls !== undefined, "stage controls captured");

		// Local view sees the rehydrated ops (applyStashedOp replays locally regardless).
		assert.strictEqual(reloadedDataObject.get("offline-key"), "offline-value");

		// Wait briefly for any inflight ops, then verify the observer has NOT seen the
		// staged op. Rehydrated unacked ops are staged and stay in the local pending
		// queue rather than being submitted on (re)connect.
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.strictEqual(
			observerDataObject.get("offline-key"),
			undefined,
			"observer should not see staged rehydrated op before commit",
		);

		// Commit and verify the observer eventually sees the change.
		observations.stageControls.commitChanges();
		await new Promise<void>((resolve) => {
			if (observerDataObject.get("offline-key") === "offline-value") {
				resolve();
				return;
			}
			const intervalId = setInterval(() => {
				if (observerDataObject.get("offline-key") === "offline-value") {
					clearInterval(intervalId);
					resolve();
				}
			}, 25);
		});
		assert.strictEqual(
			observerDataObject.get("offline-key"),
			"offline-value",
			"observer sees committed staged op",
		);
	});

	it("discardChanges rolls back staged rehydrated ops without persisting them", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { pendingState, url } = await captureOfflinePendingState(deltaConnectionServer, {
			"discard-me": "should-not-persist",
		});

		const observations = newObservations();
		const factory = createRuntimeFactory(observations, { enterStagingModeOnStart: true });
		const { loaderProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: factory,
		});

		const observerObservations = newObservations();
		const observerFactory = createRuntimeFactory(observerObservations, {
			enterStagingModeOnStart: false,
		});
		const { loaderProps: observerProps } = createLoader({
			deltaConnectionServer,
			runtimeFactory: observerFactory,
		});
		const observerContainer = await loadExistingContainer({
			...observerProps,
			request: { url },
		});
		const observerDataObject = await getDataObject(observerContainer);

		const reloaded = await loadExistingContainer({
			...loaderProps,
			request: { url },
			pendingLocalState: pendingState,
		});
		const reloadedDataObject = await getDataObject(reloaded);

		assert.ok(observations.stageControls !== undefined, "stage controls captured");

		// Discard rolls back the staged ops in the local view.
		observations.stageControls.discardChanges();
		assert.strictEqual(
			reloadedDataObject.get("discard-me"),
			undefined,
			"local view rolls back after discard",
		);

		// Observer never saw the change.
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.strictEqual(
			observerDataObject.get("discard-me"),
			undefined,
			"observer never saw discarded staged op",
		);
	});
});
