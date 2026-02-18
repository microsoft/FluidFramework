/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReducerPreconditionError, type BaseOperation } from "./combineReducers.js";
import { makeRandom } from "./random.js";
import { type SaveInfo, type AsyncGenerator, done } from "./types.js";

/**
 * A function which takes in an operation and modifies it by reference to be more
 * minimal.
 *
 * This function should be a small step forward and should avoid expensive
 * computations, as it will be run potentially thousands of times.
 *
 * A good example of a minimization transform is:
 *
 * ```ts
 * (op) => {
 *   // this transform only applies to text insertion ops
 *   if (op.type !== "addText") {
 * 		return;
 * 	 }
 *
 *   // shift the insertion index to the left by one. this makes the index
 * 	 // a smaller number and may allow other ops to be shifted to the left
 *   // as well
 * 	 if (op.index > 0) {
 * 		op.index -= 1;
 * 	 }
 * }
 * ```
 *
 * @internal
 */
export type MinimizationTransform<TOperation extends BaseOperation> = (op: TOperation) => void;
/**
 * @internal
 */
export class FuzzTestMinimizer<TOperation extends BaseOperation> {
	private initialError?: { message: string; op: BaseOperation };
	private readonly transforms: MinimizationTransform<TOperation>[];
	private readonly random = makeRandom();

	constructor(
		minimizationTransforms: MinimizationTransform<TOperation>[] | undefined,
		readonly operations: TOperation[],
		readonly saveInfo: SaveInfo,
		readonly replayTest: (generator: AsyncGenerator<TOperation, unknown>) => Promise<void>,
		readonly numIterations: number = 1000,
	) {
		this.transforms = minimizationTransforms ?? [];
	}

	async minimize(): Promise<TOperation[]> {
		// Suppress stack traces to avoid retaining large scope chains across thousands
		// of replay iterations. V8 captures CallSiteInfo objects at Error construction
		// time that hold internal (C++ level) references to the execution context;
		// even a single frame is enough to cause OOM. With stackTraceLimit=0,
		// error.message is used for comparison instead of the stack-based call site
		// extracted by extractMessage(). This is slightly less precise — two different
		// assertions could produce the same message — but in practice assertion messages
		// include unique error codes (e.g. 0x14f) that prevent false matches.
		const originalStackTraceLimit = Error.stackTraceLimit;
		Error.stackTraceLimit = 0;
		try {
			const firstError = await this.assertFails();

			if (!firstError) {
				throw new Error(
					"Attempted to minimize fuzz test, but the original case didn't fail. " +
						"This can happen if the original test failed at operation generation time rather than as part of a reducer. " +
						"Use the `skipMinimization` option to skip minimization in this case.",
				);
			}

			await this.tryDeleteEachOp();

			if (this.transforms.length === 0) {
				return this.operations;
			}

			for (let i = 0; i < this.numIterations; i += 1) {
				await this.applyTransforms();
				// some minimizations can only occur if two or more ops are modified
				// at the same time
				for (let j = 0; j < 50; j++) {
					await this.applyNRandomTransforms(2);
					await this.applyNRandomTransforms(3);
				}
				tryGC();
			}

			await this.tryDeleteEachOp();

			return this.operations;
		} finally {
			Error.stackTraceLimit = originalStackTraceLimit;
		}
	}

	private async tryDeleteEachOp(): Promise<void> {
		let previousLength = 0;
		do {
			previousLength = this.operations.length;
			let idx = previousLength - 1;

			while (idx >= 0) {
				const deletedOp = this.operations.splice(idx, 1)[0];

				// don't remove attach ops, as it creates invalid scenarios
				if (deletedOp.type === "attach" || !(await this.assertFails())) {
					this.operations.splice(idx, 0, deletedOp);
				}

				idx -= 1;
			}
			tryGC();
		} while (this.operations.length !== previousLength);
	}

	/**
	 * Apply all transforms in a random order
	 */
	private async applyTransforms(): Promise<void> {
		const transforms = [...this.transforms];
		this.random.shuffle(transforms);

		for (const transform of transforms) {
			await this.applyTransform(transform);
		}
	}

	private async applyNRandomTransforms(n: number): Promise<void> {
		if (n > this.operations.length) {
			return;
		}

		// select `n` random transforms. duplicates are allowed.
		const transforms = Array.from({ length: n })
			.fill(undefined)
			.map(() => this.random.pick(this.transforms));

		// select `n` random operations without duplicates
		let operationIdxs = [...Array.from({ length: this.operations.length }).keys()];
		this.random.shuffle(operationIdxs);
		operationIdxs = operationIdxs.slice(0, n);

		if (transforms.length !== operationIdxs.length) {
			throw new Error(
				`mismatch in number of operations and transforms: ${transforms.length} vs ${operationIdxs.length}`,
			);
		}

		const originalOperations: [string, number][] = [];

		for (let i = 0; i < transforms.length; i++) {
			const transform = transforms[i];
			const op = this.operations[operationIdxs[i]];

			originalOperations.push([JSON.stringify(op), operationIdxs[i]]);

			transform(op);
		}

		if (!(await this.assertFails())) {
			for (const [op, idx] of originalOperations) {
				this.operations[idx] = JSON.parse(op) as TOperation;
			}
		}
	}

	/**
	 * Apply a given transform on each op until it can no longer make progress
	 */
	private async applyTransform(transform: MinimizationTransform<TOperation>): Promise<void> {
		for (let opIdx = this.operations.length - 1; opIdx >= 0; opIdx--) {
			// apply this transform at most 10 times on the current op
			for (let i = 0; i < 10; i++) {
				const op = this.operations[opIdx];

				// deep clone the op as transforms modify by reference
				const originalOp = JSON.stringify(op);

				transform(op);

				if (JSON.stringify(op) === originalOp) {
					break;
				}

				if (!(await this.assertFails())) {
					this.operations[opIdx] = JSON.parse(originalOp) as TOperation;
					break;
				}
			}
		}
	}

	/**
	 * Returns whether or not the test still fails with the same error message.
	 *
	 * We use the simple heuristic of verifying the error message is the same
	 * to avoid dealing with transforms that would result in invalid ops.
	 *
	 * When stack frames are available (stackTraceLimit {@literal >} 0), extractMessage()
	 * is used for more precise call-site comparison. When suppressed
	 * (stackTraceLimit=0), error.message is used instead.
	 */
	private async assertFails(): Promise<boolean> {
		let lastOp: BaseOperation = { type: "___none___" };
		const operationsIterator = this.operations[Symbol.iterator]();
		const generator: AsyncGenerator<TOperation, unknown> = async () => {
			const val = operationsIterator.next();
			if (val.done === true) {
				return done;
			}
			return (lastOp = val.value);
		};
		const errorInfo = await getErrorInfo(this.replayTest, generator);
		if (errorInfo === undefined) {
			return false;
		}

		if (this.initialError === undefined) {
			this.initialError = { message: errorInfo, op: lastOp };
			return true;
		}

		return (
			errorInfo === this.initialError.message && this.initialError.op.type === lastOp.type
		);
	}
}

/**
 * Run a replay and return the error identity string if the test fails with a
 * relevant error, or undefined if it passes / fails with an irrelevant error.
 *
 * This is deliberately a standalone function (not a method) so the caught Error
 * goes out of scope as soon as we return.
 */
async function getErrorInfo<TOperation extends BaseOperation>(
	replayTest: (generator: AsyncGenerator<TOperation, unknown>) => Promise<void>,
	generator: AsyncGenerator<TOperation, unknown>,
): Promise<string | undefined> {
	try {
		await replayTest(generator);
		return undefined;
	} catch (error: unknown) {
		if (
			error === undefined ||
			!(error instanceof Error) ||
			error instanceof ReducerPreconditionError
		) {
			return undefined;
		}
		// Use the stack-based call site when available (more precise),
		// otherwise fall back to error.message (e.g. when stackTraceLimit is 0).
		return error.stack !== undefined && error.stack.includes("\n    at")
			? extractMessage(error.stack)
			: error.message;
	}
}

/**
 * Request garbage collection if the --expose-gc flag is enabled.
 * This helps prevent OOM during minimization by releasing memory
 * from disposed test infrastructure between replay iterations.
 */
function tryGC(): void {
	const g = globalThis as unknown as { gc?: () => void };
	if (typeof g.gc === "function") {
		g.gc();
	}
}

/**
 * Collect relevant top portion of the stack.
 * Include enough lines that the error doesn't look the same as too many other errors,
 * but few enough that the stack doesn't include details not relevant to the error.
 */
export function extractMessage(stack: string): string {
	const stackLines = stack.split("\n").map((s) => s.trim());

	const stackTop = stackLines.findIndex((s) => s.startsWith("at"));

	const linesToKeep: string[] = [];
	for (const line of stackLines.slice(stackTop)) {
		// Skip internals of assert library
		if (/^at (failPrivate) /.exec(line)) {
			continue;
		}
		linesToKeep.push(line);
		// Stop after including the first line not matching assert functions so source location which called the assert is the last thing included.
		if (!/^at (assert|fail) /.exec(line)) {
			break;
		}
	}

	return linesToKeep.join("\n");
}
