/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { SaveInfo } from "@fluid-private/stochastic-test-utils";
import { makeRandom } from "@fluid-private/stochastic-test-utils";

import type {
	BaseOperation,
	LocalServerStressHarnessEvents,
	LocalServerStressModel,
	LocalServerStressOptions,
} from "./localServerStressHarness.js";
import { ReducerPreconditionError, replayTest } from "./localServerStressHarness.js";

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

export class FuzzTestMinimizer<TOperation extends BaseOperation> {
	private initialError?: { message: string; op: BaseOperation };
	private readonly transforms: MinimizationTransform<TOperation>[];
	private readonly random = makeRandom();

	constructor(
		readonly ddsModel: LocalServerStressModel<TOperation>,
		readonly providedOptions: Partial<LocalServerStressOptions>,
		readonly operations: TOperation[],
		readonly seed: number,
		readonly saveInfo: SaveInfo,
		readonly numIterations: number = 1000,
	) {
		this.transforms = ddsModel.minimizationTransforms ?? [];
	}

	async minimize(): Promise<TOperation[]> {
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
		}

		await this.tryDeleteEachOp();

		return this.operations;
	}

	private async tryDeleteEachOp(): Promise<void> {
		let idx = this.operations.length - 1;

		while (idx > 0) {
			const deletedOp = this.operations.splice(idx, 1)[0];

			// don't remove attach ops, as it creates invalid scenarios
			if (deletedOp.type === "attach" || !(await this.assertFails())) {
				this.operations.splice(idx, 0, deletedOp);
			}

			idx -= 1;
		}
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
	 * to avoid dealing with transforms that would result in invalid ops
	 */
	private async assertFails(): Promise<boolean> {
		const emitter = (this.providedOptions.emitter ??=
			new TypedEventEmitter<LocalServerStressHarnessEvents>());

		let lastOp: BaseOperation = { type: "___none___" };
		const lastOpTracker = (op: BaseOperation): void => {
			lastOp = op;
		};
		emitter.on("operationStart", lastOpTracker);
		try {
			await replayTest(
				this.ddsModel,
				this.seed,
				this.operations,
				undefined,
				this.providedOptions,
			);
			return false;
		} catch (error: unknown) {
			if (
				error === undefined ||
				!(error instanceof Error) ||
				error instanceof ReducerPreconditionError ||
				error.stack === undefined
			) {
				return false;
			}

			const stackLines = error.stack.split("\n").map((s) => s.trim());

			const stackTop = stackLines.findIndex((s) => s.startsWith("at"));

			const message = stackLines[stackTop].startsWith("at assert ")
				? // Reproduce based on the final two lines+col of the error if it is an assert error
					// This ensures the same assert is triggered by the minified test
					stackLines
						.slice(stackTop, stackTop + 2)
						.join("\n")
				: // Otherwise the final line is sufficient
					stackLines[stackTop];

			if (this.initialError === undefined) {
				this.initialError = { message, op: lastOp };
				return true;
			}

			return (
				message === this.initialError.message && this.initialError.op.type === lastOp.type
			);
		} finally {
			emitter.off("operation", lastOpTracker);
		}
	}
}
