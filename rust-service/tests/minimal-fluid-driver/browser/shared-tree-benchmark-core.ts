export interface SharedTreeBenchmarkPair {
	readonly backend: string;
	readonly clientCount: number;
	applyEdit(clientIndex: number, value: number): void;
	appliedEditCounts(): readonly number[];
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
	readonly initialValue: number;
	readonly finalEditCount: number;
	readonly observedChangeCounts: readonly number[];
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
		const baselineCounts = [...pair.appliedEditCounts()];
		let value = Math.max(0, ...pair.lastValues().filter((item) => item !== undefined));
		const initialValue = value;
		for (let index = 0; index < options.warmupOperationCount; index++) {
			value++;
			pair.applyEdit(0, value);
		}
		await waitForConvergence(pair, value, timeoutMilliseconds);

		const operationsStarted = performance.now();
		const submissionStarted = performance.now();
		for (let index = 0; index < options.operationCount; index++) {
			value++;
			pair.applyEdit(0, value);
		}
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

async function waitForConvergence(
	pair: SharedTreeBenchmarkPair,
	value: number,
	timeoutMilliseconds: number,
): Promise<void> {
	const deadline = performance.now() + timeoutMilliseconds;
	while (!pair.lastValues().every((current) => current === value)) {
		await pair.synchronize();
		if (performance.now() >= deadline) {
			throw new Error(
				`${pair.backend} did not converge at ${value}: observedChanges=${pair.appliedEditCounts().join(", ")} values=${pair.lastValues().join(", ")}`,
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
