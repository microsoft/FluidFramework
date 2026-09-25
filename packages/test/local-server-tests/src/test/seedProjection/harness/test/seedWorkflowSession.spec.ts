/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import type { ISummaryGenerationContext } from "@fluidframework/container-runtime/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
import { wrapObjectAndOverride } from "@fluidframework/test-runtime-utils/internal";

import type { IInspectableStorageAdapter } from "../inspectableStorageAdapter.js";
import { createLocalSeedBackend } from "../localSeedWorkflowBackend.js";
import type {
	ISeedWorkflowApplication,
	ISeedWorkflowRuntimeOptions,
} from "../seedWorkflowApplication.js";
import {
	createSeedWorkflowSession,
	type ISeedWorkflowSession,
} from "../seedWorkflowSession.js";

/** Deliberately unrelated to the HTML model or its projection observations. */
interface IProbeObservation {
	readonly label: string;
}

describe("Seed workflow harness: injected application contract", () => {
	let backend: IInspectableStorageAdapter;
	let application: ISeedWorkflowApplication<IProbeObservation>;
	let session: ISeedWorkflowSession<IProbeObservation>;
	let options: ISeedWorkflowRuntimeOptions<IProbeObservation>[];
	let contexts: IContainerContext[];
	let selectedSnapshots: (ISnapshotTree | undefined)[];
	let inspectLoad:
		| ((context: IContainerContext, existing: boolean) => Promise<void>)
		| undefined;

	beforeEach(() => {
		backend = createLocalSeedBackend();
		options = [];
		contexts = [];
		selectedSnapshots = [];
		inspectLoad = undefined;
		application = {
			codeDetails: { package: "workflow-contract-probe" },
			createRuntimeFactory(runtimeOptions) {
				options.push(runtimeOptions);
				return {
					get IRuntimeFactory() {
						return this;
					},
					async instantiateRuntime(context, existing) {
						contexts.push(context);
						await inspectLoad?.(context, existing);
						// Probe the real Loader/factory boundary without implementing another application or DDS.
						throw new Error("Probe runtime intentionally not constructed");
					},
				};
			},
			seedBlobIds(snapshot) {
				selectedSnapshots.push(snapshot);
				const source = snapshot?.blobs["source.input"];
				return source === undefined ? [] : [source];
			},
		};
		session = createSeedWorkflowSession(backend, application);
	});

	afterEach(async () => {
		session.close();
		await backend.close();
	});

	it("registers the supplied code and invokes a fresh application factory for each loader", async () => {
		const first = session.makeLoader(false);
		const second = session.makeLoader();
		assert.notEqual(first, second);
		assert.deepEqual(
			options.map((option) => option.allowProjection),
			[false, true],
		);
		const loaded = await first.services.codeLoader.load(application.codeDetails);
		assert.deepEqual(loaded.details, application.codeDetails);
		inspectLoad = async (_context, existing) => {
			assert.equal(existing, false);
		};
		for (const loader of [first, second]) {
			await assert.rejects(
				loader.createDetachedContainer(application.codeDetails),
				/Probe runtime intentionally not constructed/,
			);
		}
		assert.equal(contexts.length, 2);
		assert.notEqual(contexts[0], contexts[1]);
		assert.equal(session.modelWrites, 0);
		assert.equal(selectedSnapshots.length, 0);
	});

	it("routes opaque observations, one-shot projection failure, and tracked acceptance", async () => {
		session.makeLoader();
		const hooks = options[0];
		const observation: IProbeObservation = { label: "non-HTML observation" };
		hooks.observe(observation);
		assert.equal(session.observations[0], observation);
		session.failNextProjection();
		assert.throws(() => hooks.beforeProjection(12), /Injected projection failure/);
		hooks.beforeProjection(13);
		assert.equal(session.projectionCalls, 2);
		assert.equal(session.projectionCheckpoint, 13);
		const summaryContext: ISummaryGenerationContext = {
			fullTree: true,
			trackState: true,
			referenceSequenceNumber: 13,
			previousSummary: undefined,
		};
		hooks.observeSummary(summaryContext);
		assert.equal(session.summaryContexts[0], summaryContext);
		const accepted = session.waitForSummaryAcceptance("probe-version");
		hooks.onSummaryAccepted({
			ackHandle: "probe-version",
			proposalHandle: "probe-proposal",
			referenceSequenceNumber: 13,
		});
		await accepted;
		await session.waitForSummaryAcceptance("probe-version");
	});

	it("uses the application's source IDs for restoration and forwards unrelated storage and batches", async () => {
		const loader = session.makeLoader(true, true);
		await assert.rejects(
			loader.createDetachedContainer(application.codeDetails),
			/Probe runtime intentionally not constructed/,
		);
		const original = contexts[0];
		const snapshot: ISnapshotTree = {
			blobs: { "source.input": "probe-source", "native.state": "probe-native" },
			trees: {},
		};
		const reads: string[] = [];
		const sequences: (number | undefined)[] = [];
		const bytes = new ArrayBuffer(4);
		const pending = { pending: "opaque application state" };
		const context = wrapObjectAndOverride(
			original,
			{
				baseSnapshot: () => snapshot,
				pendingLocalState: () => pending,
				storage: (target) =>
					wrapObjectAndOverride(target.storage, {
						readBlob: () => async (id) => {
							reads.push(id);
							return bytes;
						},
					}),
				submitBatchFn: () => (batch, sequence) => {
					assert.deepEqual(batch, [{ contents: "opaque op" }]);
					sequences.push(sequence);
					return 23;
				},
			},
			{ receiver: "target" },
		);
		inspectLoad = async (received, existing) => {
			assert.equal(existing, true);
			assert.equal(received.pendingLocalState, pending);
			assert.equal(received.baseSnapshot, snapshot);
			await assert.rejects(
				received.storage.readBlob("probe-source"),
				/Seed bodies unavailable during pending-state reconstruction/,
			);
			assert.equal(await received.storage.readBlob("probe-native"), bytes);
			assert.equal(received.submitBatchFn([{ contents: "opaque op" }], 17), 23);
		};
		const loaded = await loader.services.codeLoader.load(application.codeDetails);
		const factory = loaded.module.fluidExport.IRuntimeFactory;
		assert(factory !== undefined);
		await assert.rejects(
			factory.instantiateRuntime(context, true),
			/Probe runtime intentionally not constructed/,
		);
		assert.deepEqual(selectedSnapshots, [snapshot]);
		assert.deepEqual(reads, ["probe-native"]);
		assert.deepEqual(sequences, [17]);
		assert.equal(session.modelWrites, 1);

		inspectLoad = async (received) => {
			assert.equal(await received.storage.readBlob("probe-source"), bytes);
		};
		const ordinaryLoader = session.makeLoader();
		const ordinary = await ordinaryLoader.services.codeLoader.load(application.codeDetails);
		const ordinaryFactory = ordinary.module.fluidExport.IRuntimeFactory;
		assert(ordinaryFactory !== undefined);
		await assert.rejects(
			ordinaryFactory.instantiateRuntime(context, true),
			/Probe runtime intentionally not constructed/,
		);
		assert.deepEqual(reads, ["probe-native", "probe-source"]);
		assert.deepEqual(selectedSnapshots, [snapshot]);
	});
});
