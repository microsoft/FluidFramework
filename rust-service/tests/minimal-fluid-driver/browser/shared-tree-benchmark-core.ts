export interface SharedTreeBenchmarkPair {
	readonly backend: string;
	readonly clientCount: number;
	setValue(clientIndex: number, value: number): void;
	values(): readonly number[];
	synchronize(): Promise<void>;
	prepare?(): Promise<void>;
	close(): void;
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
	readonly totalOperationMilliseconds: number;
	readonly operationsPerSecond: number;
	readonly latencyMilliseconds: {
		readonly minimum: number;
		readonly median: number;
		readonly p95: number;
		readonly maximum: number;
	};
	readonly finalValue: number;
}

export async function runSharedTreeBenchmark(
	createPair: () => Promise<SharedTreeBenchmarkPair>,
	options: SharedTreeBenchmarkOptions,
): Promise<SharedTreeBenchmarkResult> {
	assertPositiveInteger(options.operationCount, "operationCount");
	assertNonnegativeInteger(options.warmupOperationCount, "warmupOperationCount");
	const timeoutMilliseconds = options.timeoutMilliseconds ?? 10_000;
	const startupStarted = performance.now();
	const pair = await createPair();
	const startupMilliseconds = performance.now() - startupStarted;

	try {
		await pair.prepare?.();
		let value = Math.max(...pair.values());
		for (let index = 0; index < options.warmupOperationCount; index++) {
			value++;
			await applyAndConverge(pair, index % pair.clientCount, value, timeoutMilliseconds);
		}

		const latencies: number[] = [];
		const operationsStarted = performance.now();
		for (let index = 0; index < options.operationCount; index++) {
			value++;
			const operationStarted = performance.now();
			await applyAndConverge(pair, index % pair.clientCount, value, timeoutMilliseconds);
			latencies.push(performance.now() - operationStarted);
		}
		const totalOperationMilliseconds = performance.now() - operationsStarted;

		return {
			status: "passed",
			backend: pair.backend,
			clientCount: pair.clientCount,
			operationCount: options.operationCount,
			warmupOperationCount: options.warmupOperationCount,
			startupMilliseconds,
			totalOperationMilliseconds,
			operationsPerSecond: (options.operationCount * 1_000) / totalOperationMilliseconds,
			latencyMilliseconds: {
				minimum: Math.min(...latencies),
				median: percentile(latencies, 0.5),
				p95: percentile(latencies, 0.95),
				maximum: Math.max(...latencies),
			},
			finalValue: value,
			...pair.metrics(),
		};
	} finally {
		pair.close();
	}
}

async function applyAndConverge(
	pair: SharedTreeBenchmarkPair,
	clientIndex: number,
	value: number,
	timeoutMilliseconds: number,
): Promise<void> {
	pair.setValue(clientIndex, value);
	const deadline = performance.now() + timeoutMilliseconds;
	while (!pair.values().every((current) => current === value)) {
		await pair.synchronize();
		if (performance.now() >= deadline) {
			throw new Error(
				`${pair.backend} did not converge value ${value}: ${pair.values().join(", ")}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
}

function percentile(samples: readonly number[], fraction: number): number {
	const sorted = [...samples].sort((left, right) => left - right);
	const value = sorted[Math.ceil(fraction * sorted.length) - 1];
	if (value === undefined) {
		throw new Error("cannot calculate a percentile without samples");
	}
	return value;
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
