/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	LoaderHeader,
	type IContainer,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { Loader } from "@fluidframework/container-loader/internal";
import type { ISummaryGenerationContext } from "@fluidframework/container-runtime/internal";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";
import {
	createTestConfigProvider,
	LoaderContainerTracker,
	LocalCodeLoader,
} from "@fluidframework/test-utils/internal";

import type { IInspectableStorageAdapter } from "./inspectableStorageAdapter.js";
import type { ISeedWorkflowApplication } from "./seedWorkflowApplication.js";

/** Application-independent client orchestration and lifecycle observations for seed workflow tests. */
export interface ISeedWorkflowSession<TObservation> {
	/** Coordinates real client queues rather than mocking op delivery. */
	readonly tracker: LoaderContainerTracker;
	/** Completed loads in observation order, interpreted only by application-specific assertions. */
	readonly observations: TObservation[];
	/** Construct an independent loader, optionally forbidding conversion or restoration source reads. */
	makeLoader(allowProjection?: boolean, denySeedBodyReads?: boolean): Loader;
	/** Enroll a container, including a separately created summarizer, in synchronization and cleanup. */
	track(container: IContainer): IContainer;
	/** Count submitted model/runtime batch messages to detect initialization writes merely on open. */
	readonly modelWrites: number;
	/** Count callback attempts, including failures and summaries that reuse native handles. */
	readonly projectionCalls: number;
	/** Checkpoint observed by the most recent application projection callback. */
	readonly projectionCheckpoint: number | undefined;
	/** Effective summary generation policy observed by application callbacks. */
	readonly summaryContexts: readonly ISummaryGenerationContext[];
	/** Wait for native and application reuse state to adopt a tracked storage version. */
	waitForSummaryAcceptance(version: string): Promise<void>;
	/** Make exactly the next projection callback throw before upload. */
	failNextProjection(): void;
	/** Open a file/version or restore pending state with a newly constructed loader. */
	load(
		url: string,
		allowProjection?: boolean,
		version?: string,
		pending?: string,
	): Promise<IContainer>;
	/** Dispose all clients and coordination listeners; the caller still owns backend shutdown. */
	close(): void;
}

/**
 * Wire an injected application to a backend with real client queues, summary transport, and ACKs.
 * No seed schema, DDS, model edits, serializer, or projection layout is selected by this harness.
 */
export function createSeedWorkflowSession<TObservation>(
	backend: IInspectableStorageAdapter,
	application: ISeedWorkflowApplication<TObservation>,
	useSnapshotApi = true,
): ISeedWorkflowSession<TObservation> {
	const tracker = new LoaderContainerTracker(true);
	const observations: TObservation[] = [];
	const containers: IContainer[] = [];
	let modelWrites = 0;
	let failProjection = false;
	let projectionCalls = 0;
	let projectionCheckpoint: number | undefined;
	const summaryContexts: ISummaryGenerationContext[] = [];
	const acceptedVersions = new Set<string>();
	const acceptanceWaiters = new Map<string, () => void>();
	const makeLoader = (allowProjection = true, denySeedBodyReads = false): Loader => {
		const appFactory = application.createRuntimeFactory({
			allowProjection,
			observe: (observation) => observations.push(observation),
			beforeProjection: (checkpoint) => {
				projectionCalls++;
				projectionCheckpoint = checkpoint;
				if (failProjection) {
					failProjection = false;
					throw new Error("Injected projection failure before upload");
				}
			},
			observeSummary: (context) => summaryContexts.push(context),
			onSummaryAccepted: (context) => {
				assert(context.ackHandle !== undefined);
				acceptedVersions.add(context.ackHandle);
				acceptanceWaiters.get(context.ackHandle)?.();
				acceptanceWaiters.delete(context.ackHandle);
			},
		});
		const factory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) => {
				const deniedIds =
					denySeedBodyReads && context.pendingLocalState !== undefined
						? new Set(application.seedBlobIds(context.baseSnapshot))
						: new Set<string>();
				return appFactory.instantiateRuntime(
					wrapObjectAndOverride(
						context,
						{
							storage: (original) =>
								deniedIds.size === 0
									? original.storage
									: wrapObjectAndOverride(
											original.storage,
											{
												readBlob: (storage) => async (id) => {
													if (deniedIds.has(id)) {
														throw new Error(
															"Seed bodies unavailable during pending-state reconstruction",
														);
													}
													return storage.readBlob(id);
												},
											},
											{ receiver: "target" },
										),
							submitBatchFn: (original) => (batch, sequence) => {
								modelWrites += batch.length;
								return original.submitBatchFn(batch, sequence);
							},
						},
						{ receiver: "target" },
					),
					existing,
				);
			},
		};
		return new Loader({
			documentServiceFactory: backend.documentServiceFactory,
			urlResolver: backend.urlResolver,
			codeLoader: new LocalCodeLoader([[application.codeDetails, factory]]),
			configProvider: createTestConfigProvider({
				"Fluid.Container.UseLoadingGroupIdForSnapshotFetch2": useSnapshotApi,
				"Fluid.Container.enableOfflineFull": true,
			}),
		});
	};
	const track = (container: IContainer): IContainer => {
		containers.push(container);
		tracker.addContainer(container);
		return container;
	};
	return {
		tracker,
		observations,
		makeLoader,
		track,
		get modelWrites(): number {
			return modelWrites;
		},
		get projectionCalls(): number {
			return projectionCalls;
		},
		get projectionCheckpoint(): number | undefined {
			return projectionCheckpoint;
		},
		summaryContexts,
		async waitForSummaryAcceptance(version): Promise<void> {
			if (acceptedVersions.has(version)) return;
			await new Promise<void>((resolve) => acceptanceWaiters.set(version, resolve));
		},
		failNextProjection: (): void => {
			failProjection = true;
		},
		async load(
			url: string,
			allowProjection = true,
			version?: string,
			pending?: string,
		): Promise<IContainer> {
			return track(
				await makeLoader(allowProjection, pending !== undefined).resolve(
					{
						url,
						headers: version === undefined ? undefined : { [LoaderHeader.version]: version },
					},
					pending,
				),
			);
		},
		close(): void {
			for (const container of containers) {
				if (!container.closed) container.close();
				container.dispose();
			}
			tracker.reset();
		},
	};
}
