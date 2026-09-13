export interface SharedTreeBenchmarkPair {
	readonly backend: string;
	readonly clientCount: number;
	appendEdit(clientIndex: number, value: number): void;
	editCounts(): readonly number[];
	lastValues(): readonly (number | undefined)[];
	synchronize(): Promise<void>;
	prepare?(): Promise<void>;
	close(): void | Promise<void>;
	metrics(): Record<string, unknown>;
}

export interface SharedTreeBenchmarkOptions {
	readonly operationCount: number;
	readonly warmupOperationCount: number;
	readonly timeoutMilliseconds?: number;
}

export interface SharedTreeBenchmarkResult extends Record<string, unknown> {
	readonly status: "passed";
	readonly backend: string;
	readonly clientCount: number;
	readonly operationCount: number;
	readonly warmupOperationCount: number;
	readonly startupMilliseconds: number;
	readonly submissionMilliseconds: number;
	readonly convergenceMilliseconds: number;
	readonly totalOperationMilliseconds: number;
	readonly operationsPerSecond: number;
	readonly writerIndex: 0;
	readonly observerIndex: 1;
	readonly finalEditCount: number;
	readonly finalValue: number;
}

export async function runSharedTreeBenchmark(
	createPair: () => Promise<SharedTreeBenchmarkPair>,
	options: SharedTreeBenchmarkOptions,
): Promise<SharedTreeBenchmarkResult> {
	assertPositiveInteger(options.operationCount, "operationCount");
	assertNonnegativeInteger(options.warmupOperationCount, "warmupOperationCount");
	const timeoutMilliseconds = options.timeoutMilliseconds ?? 120_000;
	const startupStarted = performance.now();
	const pair = await createPair();
	const startupMilliseconds = performance.now() - startupStarted;

	try {
		await pair.prepare?.();
		if (pair.clientCount !== 2) {
			throw new Error(`${pair.backend} must expose exactly one writer and one observer`);
		}
		const baselineCounts = pair.editCounts();
		if (!baselineCounts.every((count) => count === baselineCounts[0])) {
			throw new Error(`${pair.backend} did not start converged: ${baselineCounts.join(", ")}`);
		}
		const baselineCount = baselineCounts[0];
		if (baselineCount === undefined) {
			throw new Error(`${pair.backend} did not expose a writer baseline`);
		}
		let value = Math.max(0, ...pair.lastValues().filter((item) => item !== undefined));
		for (let index = 0; index < options.warmupOperationCount; index++) {
			value++;
			pair.appendEdit(0, value);
		}
		await waitForConvergence(
			pair,
			baselineCount + options.warmupOperationCount,
			value,
			timeoutMilliseconds,
		);

		const operationsStarted = performance.now();
		const submissionStarted = performance.now();
		for (let index = 0; index < options.operationCount; index++) {
			value++;
			pair.appendEdit(0, value);
		}
		const submissionMilliseconds = performance.now() - submissionStarted;
		const convergenceStarted = performance.now();
		const finalEditCount =
			baselineCount + options.warmupOperationCount + options.operationCount;
		await waitForConvergence(pair, finalEditCount, value, timeoutMilliseconds);
		const convergenceMilliseconds = performance.now() - convergenceStarted;
		const totalOperationMilliseconds = performance.now() - operationsStarted;

		return {
			status: "passed",
			backend: pair.backend,
			clientCount: pair.clientCount,
			operationCount: options.operationCount,
			warmupOperationCount: options.warmupOperationCount,
			startupMilliseconds,
			submissionMilliseconds,
			convergenceMilliseconds,
			totalOperationMilliseconds,
			operationsPerSecond: (options.operationCount * 1_000) / totalOperationMilliseconds,
			writerIndex: 0,
			observerIndex: 1,
			finalEditCount,
			finalValue: value,
			...pair.metrics(),
		};
	} finally {
		await pair.close();
	}
}

async function waitForConvergence(
	pair: SharedTreeBenchmarkPair,
	expectedCount: number,
	value: number,
	timeoutMilliseconds: number,
): Promise<void> {
	const deadline = performance.now() + timeoutMilliseconds;
	while (
		!pair.editCounts().every((count) => count === expectedCount) ||
		!pair.lastValues().every((current) => current === value)
	) {
		await pair.synchronize();
		if (performance.now() >= deadline) {
			throw new Error(
				`${pair.backend} did not converge ${expectedCount} edits ending at ${value}: counts=${pair.editCounts().join(", ")} values=${pair.lastValues().join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer`);
	}
}

function assertNonnegativeInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new Error(`${name} must be a nonnegative integer`);
	}
}
