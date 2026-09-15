/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** Backend-specific pair of Fluid clients driven by the common workload loop. */
export interface SharedTreeBenchmarkPair {
	/** DDS implementation used by both clients. */
	readonly dataStructure: "dummy" | "shared-tree";
	/** Stable backend label recorded in benchmark output. */
	readonly backend: string;
	/** Number of clients exposed by the pair; the workload requires exactly two. */
	readonly clientCount: number;
	/** Applies one scalar edit through the selected client. */
	applyEdit(clientIndex: number, value: number): void;
	/** Returns cumulative applied-operation counts for convergence diagnostics. */
	appliedEditCounts(): readonly number[];
	/** Returns each client's current scalar value. */
	lastValues(): readonly (number | undefined)[];
	/** Waits for backend-specific submission work before checking convergence. */
	synchronize(): Promise<void>;
	/** Runs an optional lifecycle probe before timed edits begin. */
	prepare?(): Promise<void>;
	/** Releases clients, services, and listeners owned by the pair. */
	close(): void | Promise<void>;
	/** Returns backend-specific measurements merged into the detailed result. */
	metrics(): Record<string, unknown>;
}

/** Workload and timeout controls for one benchmark sample. */
export interface SharedTreeBenchmarkOptions {
	/** Number of timed edits. */
	readonly operationCount: number;
	/** Number of untimed edits before measurement. */
	readonly warmupOperationCount: number;
	/** Edits submitted before yielding a Fluid batch boundary. */
	readonly operationsPerTurn?: number;
	/** Whether each yielded batch waits for observer convergence. */
	readonly synchronizePerTurn?: boolean;
	/** Maximum time allowed for each convergence wait. */
	readonly timeoutMilliseconds?: number;
}

/** Detailed measurements and convergence evidence for one browser sample. */
export interface SharedTreeBenchmarkResult extends Record<string, unknown> {
	/** Successful samples always report the passed status. */
	readonly status: "passed";
	/** DDS implementation exercised by the sample. */
	readonly dataStructure: "dummy" | "shared-tree";
	/** Backend label supplied by the client pair. */
	readonly backend: string;
	/** Number of clients participating in the sample. */
	readonly clientCount: number;
	/** Number of measured edits. */
	readonly operationCount: number;
	/** Number of untimed warmup edits. */
	readonly warmupOperationCount: number;
	/** Finite batch size, or null when all edits share one turn. */
	readonly operationsPerTurn: number | null;
	/** Whether every yielded batch waited for convergence. */
	readonly synchronizePerTurn: boolean;
	/** Time to create and connect the pair. */
	readonly startupMilliseconds: number;
	/** Time to submit all measured edits. */
	readonly submissionMilliseconds: number;
	/** Time from final submission until both clients converge. */
	readonly convergenceMilliseconds: number;
	/** Total measured submission and convergence time. */
	readonly totalOperationMilliseconds: number;
	/** Measured edit count divided by total operation time. */
	readonly operationsPerSecond: number;
	/** Fixed index of the client that submits edits. */
	readonly writerIndex: 0;
	/** Fixed index of the client used to observe convergence. */
	readonly observerIndex: 1;
	/** Scalar value before warmup begins. */
	readonly initialValue: number;
	/** Combined warmup and measured edit count. */
	readonly finalEditCount: number;
	/** Per-client applied-operation deltas for the sample. */
	readonly observedChangeCounts: readonly number[];
	/** Scalar value observed by every client at completion. */
	readonly finalValue: number;
}

/** Runs the shared two-client workload and always closes the backend pair. */
export async function runSharedTreeBenchmark(
	createPair: () => Promise<SharedTreeBenchmarkPair>,
	options: SharedTreeBenchmarkOptions,
): Promise<SharedTreeBenchmarkResult> {
	assertPositiveInteger(options.operationCount, "operationCount");
	assertNonnegativeInteger(options.warmupOperationCount, "warmupOperationCount");
	const operationsPerTurn = options.operationsPerTurn ?? Number.POSITIVE_INFINITY;
	if (operationsPerTurn !== Number.POSITIVE_INFINITY) {
		assertPositiveInteger(operationsPerTurn, "operationsPerTurn");
	}
	const synchronizePerTurn = options.synchronizePerTurn ?? false;
	if (synchronizePerTurn && operationsPerTurn === Number.POSITIVE_INFINITY) {
		throw new Error("synchronizePerTurn requires a finite operationsPerTurn");
	}
	const timeoutMilliseconds = options.timeoutMilliseconds ?? 120_000;
	const startupStarted = performance.now();
	const pair = await createPair();
	const startupMilliseconds = performance.now() - startupStarted;

	try {
		await pair.prepare?.();
		if (pair.clientCount !== 2) {
			throw new Error(`${pair.backend} must expose exactly one writer and one observer`);
		}
		const baselineCounts = [...pair.appliedEditCounts()];
		let value = Math.max(0, ...pair.lastValues().filter((item) => item !== undefined));
		const initialValue = value;
		value = await applyEdits(
			pair,
			options.warmupOperationCount,
			operationsPerTurn,
			synchronizePerTurn,
			timeoutMilliseconds,
			value,
		);
		await waitForConvergence(pair, value, timeoutMilliseconds);

		const operationsStarted = performance.now();
		const submissionStarted = performance.now();
		value = await applyEdits(
			pair,
			options.operationCount,
			operationsPerTurn,
			synchronizePerTurn,
			timeoutMilliseconds,
			value,
		);
		const submissionMilliseconds = performance.now() - submissionStarted;
		const convergenceStarted = performance.now();
		const finalEditCount = options.warmupOperationCount + options.operationCount;
		await waitForConvergence(pair, value, timeoutMilliseconds);
		const convergenceMilliseconds = performance.now() - convergenceStarted;
		const totalOperationMilliseconds = performance.now() - operationsStarted;
		const observedChangeCounts = pair
			.appliedEditCounts()
			.map((count, index) => count - (baselineCounts[index] ?? 0));

		return {
			status: "passed",
			dataStructure: pair.dataStructure,
			backend: pair.backend,
			clientCount: pair.clientCount,
			operationCount: options.operationCount,
			warmupOperationCount: options.warmupOperationCount,
			operationsPerTurn:
				operationsPerTurn === Number.POSITIVE_INFINITY ? null : operationsPerTurn,
			synchronizePerTurn,
			startupMilliseconds,
			submissionMilliseconds,
			convergenceMilliseconds,
			totalOperationMilliseconds,
			operationsPerSecond: (options.operationCount * 1_000) / totalOperationMilliseconds,
			writerIndex: 0,
			observerIndex: 1,
			initialValue,
			finalEditCount,
			observedChangeCounts,
			finalValue: value,
			...pair.metrics(),
		};
	} finally {
		await pair.close();
	}
}

/** Applies monotonically increasing scalar edits with configured batch boundaries. */
async function applyEdits(
	pair: SharedTreeBenchmarkPair,
	operationCount: number,
	operationsPerTurn: number,
	synchronizePerTurn: boolean,
	timeoutMilliseconds: number,
	value: number,
): Promise<number> {
	for (let index = 0; index < operationCount; index++) {
		value++;
		pair.applyEdit(0, value);
		if ((index + 1) % operationsPerTurn === 0) {
			await yieldFluidBatchBoundary();
			if (synchronizePerTurn) {
				await waitForConvergence(pair, value, timeoutMilliseconds);
			}
		}
	}
	return value;
}

/** Yields to Fluid's microtask-based batching boundary. */
async function yieldFluidBatchBoundary(): Promise<void> {
	await Promise.resolve();
}

/** Polls backend synchronization until every client observes the expected value. */
async function waitForConvergence(
	pair: SharedTreeBenchmarkPair,
	value: number,
	timeoutMilliseconds: number,
): Promise<void> {
	const deadline = performance.now() + timeoutMilliseconds;
	for (;;) {
		await pair.synchronize();
		if (pair.lastValues().every((current) => current === value)) {
			return;
		}
		if (performance.now() >= deadline) {
			throw new Error(
				`${pair.backend} did not converge at ${value}: observedChanges=${pair.appliedEditCounts().join(", ")} values=${pair.lastValues().join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

/** Validates a required positive integer workload setting. */
function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
}

/** Validates a required nonnegative integer workload setting. */
function assertNonnegativeInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative integer`);
	}
}
