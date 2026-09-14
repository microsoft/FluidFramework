import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { Tree } from "@fluidframework/tree";

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

async function createPair(): Promise<SharedTreeBenchmarkPair> {
	const client = new TinyliciousClient({
		connection: { port: numberParameter("tinyliciousPort", 7070) },
	});
	const { container: firstContainer } = await client.createContainer(
		benchmarkContainerSchema,
		"2.0.0",
	);
	const firstView = firstContainer.initialObjects.tree.viewWith(benchmarkTreeConfiguration);
	firstView.initialize({ value: 0 });
	const containerId = await firstContainer.attach();
	const { container: secondContainer } = await client.getContainer(
		containerId,
		benchmarkContainerSchema,
		"2.0.0",
	);
	const secondView = secondContainer.initialObjects.tree.viewWith(benchmarkTreeConfiguration);
	const editCounts: [number, number] = [0, 0];
	const unsubscribeFirst = Tree.on(firstView.root, "nodeChanged", () => editCounts[0]++);
	const unsubscribeSecond = Tree.on(secondView.root, "nodeChanged", () => editCounts[1]++);

	return {
		backend: "tinylicious-client",
		clientCount: 2,
		applyEdit: (clientIndex, value) => {
			(clientIndex === 0 ? firstView : secondView).root.value = value;
		},
		appliedEditCounts: () => editCounts,
		lastValues: () => [firstView.root.value, secondView.root.value],
		synchronize: async () => {},
		close: () => {
			unsubscribeFirst();
			unsubscribeSecond();
			firstView.dispose();
			secondView.dispose();
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
