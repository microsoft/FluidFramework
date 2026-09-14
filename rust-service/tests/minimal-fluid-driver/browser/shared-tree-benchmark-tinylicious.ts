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

declare global {
	interface Window {
		__sharedTreeBenchmarkResult?: Promise<Record<string, unknown>>;
	}
}

const parameters = new URLSearchParams(location.search);
const dataStructure = parseBenchmarkDataStructure(parameters.get("dds"));

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
