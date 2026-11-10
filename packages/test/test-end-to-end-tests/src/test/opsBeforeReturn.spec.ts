/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import type {
	IContainer,
	IContainerContext,
	IContainerLoadMode,
	IDeltaQueue,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { LoaderHeader } from "@fluidframework/container-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
	getContainerEntryPointBackCompat,
	toIDeltaManagerFull,
} from "@fluidframework/test-utils/internal";

const testContainerConfig: ITestContainerConfig = {
	runtimeOptions: {
		summaryOptions: {
			summaryConfigOverrides: {
				// Keep all ops after the attach summary, so that loading has to fetch and process them.
				state: "disabled",
			},
		},
	},
};

const opCount = 20;

/**
 * Behavior to apply to the inbound queue of the loaded container after each processed op.
 *
 * - `"yield"` pauses the queue and resumes it on a later macrotask.
 * This is the same pattern that container-runtime's `DeltaScheduler` uses when op processing exceeds its time budget.
 *
 * - `"hold"` pauses the queue once and does not resume it until the test does.
 * This simulates a component that waits for ops that are not available (for example, the rest of an incomplete batch).
 */
type InboundBehavior = "yield" | "hold";

describeCompat("opsBeforeReturn load mode", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", function () {
		provider = getTestObjectProvider();
		// The scenario depends on the ops being fetched from storage and processed during load,
		// which we can control reliably only with the local driver.
		if (provider.driver.type !== "local") {
			this.skip();
		}
	});

	/**
	 * Creates a document that has {@link opCount} ops after its attach summary.
	 * @returns The sequence number of the last op in the document.
	 */
	async function createDocumentWithOps(): Promise<number> {
		const container = await provider.makeTestContainer(testContainerConfig);
		const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		for (let i = 0; i < opCount; i++) {
			dataObject.root.set(`key-${i}`, i);
		}
		await provider.ensureSynchronized();
		const lastSeqNumber = container.deltaManager.lastSequenceNumber;
		container.close();
		return lastSeqNumber;
	}

	/**
	 * Loads the document with a runtime that applies `behavior` to the inbound queue after each processed op.
	 */
	async function loadWithInboundBehavior(
		loadMode: IContainerLoadMode,
		behavior: InboundBehavior,
	): Promise<{ container: IContainer; releaseHold: () => void }> {
		let inbound: IDeltaQueue<ISequencedDocumentMessage> | undefined;
		let held = false;
		let enabled = true;

		const runtimeFactory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (
				context: IContainerContext,
				existing: boolean,
			): Promise<IRuntime> => {
				const entryPoint = provider.createFluidEntryPoint(testContainerConfig);
				const innerFactory: FluidObject<IRuntimeFactory> =
					"fluidExport" in entryPoint ? entryPoint.fluidExport : entryPoint;
				assert(
					innerFactory.IRuntimeFactory !== undefined,
					"entry point is not a runtime factory",
				);
				const runtime = await innerFactory.IRuntimeFactory.instantiateRuntime(
					context,
					existing,
				);

				const queue = toIDeltaManagerFull(context.deltaManager).inbound;
				inbound = queue;
				queue.on("op", () => {
					if (!enabled) {
						return;
					}
					if (behavior === "yield") {
						void queue.pause();
						setTimeout(() => queue.resume(), 0);
					} else if (!held) {
						held = true;
						void queue.pause();
					}
				});
				return runtime;
			},
		};

		const container = await provider.loadContainer(runtimeFactory, undefined, {
			[LoaderHeader.loadMode]: loadMode,
		});
		enabled = false;

		return {
			container,
			releaseHold: () => {
				assert(inbound !== undefined, "inbound queue should be captured");
				if (held) {
					held = false;
					inbound.resume();
				}
			},
		};
	}

	for (const opsBeforeReturn of ["cached", "all"] as const) {
		it(`processes all fetched ops before returning when the runtime yields during processing (opsBeforeReturn: "${opsBeforeReturn}")`, async () => {
			const lastSeqNumber = await createDocumentWithOps();

			const { container } = await loadWithInboundBehavior(
				{ opsBeforeReturn, deltaConnection: "none" },
				"yield",
			);

			const { deltaManager } = container;
			assert.strictEqual(
				deltaManager.lastSequenceNumber,
				deltaManager.lastKnownSeqNumber,
				"all known ops should be processed when load returns",
			);
			assert(
				deltaManager.lastSequenceNumber >= lastSeqNumber,
				`expected the loaded container to process up to '${lastSeqNumber}', but it processed up to '${deltaManager.lastSequenceNumber}'`,
			);
			assert.strictEqual(
				toIDeltaManagerFull(deltaManager).inbound.length,
				0,
				"inbound queue should be empty",
			);
		});
	}

	it(`returns without deadlocking when the runtime holds the inbound queue (opsBeforeReturn: "all")`, async () => {
		const lastSeqNumber = await createDocumentWithOps();

		const { container, releaseHold } = await loadWithInboundBehavior(
			{ opsBeforeReturn: "all", deltaConnection: "none" },
			"hold",
		);

		const { deltaManager } = container;
		assert(
			deltaManager.lastSequenceNumber < lastSeqNumber,
			"ops after the hold should not be processed yet",
		);
		assert(
			toIDeltaManagerFull(deltaManager).inbound.length > 0,
			"held ops should still be queued",
		);

		// When the hold is released and the container connects, it catches up.
		releaseHold();
		container.connect();
		await new Promise<void>((resolve) => {
			const check = (): void => {
				if (deltaManager.lastSequenceNumber >= lastSeqNumber) {
					deltaManager.off("op", check);
					resolve();
				}
			};
			deltaManager.on("op", check);
			check();
		});
		assert(
			deltaManager.lastSequenceNumber >= lastSeqNumber,
			`expected the container to catch up to '${lastSeqNumber}', but it processed up to '${deltaManager.lastSequenceNumber}'`,
		);
	});
});
