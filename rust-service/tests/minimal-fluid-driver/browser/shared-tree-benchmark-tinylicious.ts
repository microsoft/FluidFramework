/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TinyliciousClient } from "@fluidframework/tinylicious-client";

import { adaptInitialObject, parseBenchmarkDataStructure } from "./benchmark-data-object.js";
import {
	runSharedTreeBenchmark,
	type SharedTreeBenchmarkPair,
} from "./shared-tree-benchmark-core.js";
import {
	benchmarkContainerSchema,
	benchmarkTreeConfiguration,
} from "./shared-tree-benchmark-schema.js";

/** Browser result hook read by the headless benchmark runner. */
declare global {
	/** Benchmark-specific browser globals. */
	interface Window {
		/** Promise resolving to the detailed benchmark sample. */
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

/** Browser query parameters supplied by the headless benchmark runner. */
const parameters = new URLSearchParams(location.search);
/** DDS implementation selected for this benchmark sample. */
const dataStructure = parseBenchmarkDataStructure(parameters.get("dds"));

/** Creates the two-client Tinylicious benchmark backend. */
async function createPair(): Promise<SharedTreeBenchmarkPair> {
	const containerSchema = benchmarkContainerSchema(dataStructure);
	const client = new TinyliciousClient({
		connection: { port: numberParameter("tinyliciousPort", 7070) },
	});
	const { container: firstContainer } = await client.createContainer(containerSchema, "2.0.0");
	const firstData = adaptInitialObject(
		firstContainer.initialObjects.data,
		dataStructure,
		true,
		benchmarkTreeConfiguration,
	);
	const containerId = await firstContainer.attach();
	const { container: secondContainer } = await client.getContainer(
		containerId,
		containerSchema,
		"2.0.0",
	);
	const secondData = adaptInitialObject(
		secondContainer.initialObjects.data,
		dataStructure,
		false,
		benchmarkTreeConfiguration,
	);

	return {
		dataStructure,
		backend: "tinylicious-client",
		clientCount: 2,
		applyEdit: (clientIndex, value) => (clientIndex === 0 ? firstData : secondData).set(value),
		appliedEditCounts: () => [firstData.appliedOpCount, secondData.appliedOpCount],
		lastValues: () => [firstData.value, secondData.value],
		synchronize: async () => {},
		close: () => {
			firstData.dispose();
			secondData.dispose();
			firstContainer.dispose();
			secondContainer.dispose();
		},
		metrics: () => ({
			browser: navigator.userAgent,
			wireBytes: null,
			peakResponseBytes: null,
			peakSubscriptionFrameBytes: null,
			peakSubscriptionQueueDepth: null,
			resumeOpenMilliseconds: null,
			resumeFirstDeliveryMilliseconds: null,
			resumeCursorCount: null,
			forceWriteConnection: false,
		}),
	};
}

/** Reads a numeric browser parameter or returns its workload default. */
function numberParameter(name: string, fallback: number): number {
	const value = parameters.get(name);
	return value === null ? fallback : Number(value);
}

window.__sharedTreeBenchmarkResult = runSharedTreeBenchmark(createPair, {
	operationCount: numberParameter("operations", 100),
	warmupOperationCount: numberParameter("warmup", 10),
	operationsPerTurn: numberParameter("operationsPerTurn", Number.POSITIVE_INFINITY),
	synchronizePerTurn: parameters.get("synchronizePerTurn") === "true",
}).catch((error: unknown) => ({ status: "failed", error: String(error) }));
