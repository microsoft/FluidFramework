/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SaveInfo, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { BaseOperation, DDSFuzzModel, DDSFuzzSuiteOptions, replayTest } from "./ddsFuzzHarness";

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
 */
export type MinimizationTransform<TOperation extends BaseOperation> = (op: TOperation) => void;

export class FuzzTestMinimizer<
	TChannelFactory extends IChannelFactory,
	TOperation extends BaseOperation,
> {
	private initialErrorMessage: string | undefined;
	private readonly transforms: MinimizationTransform<TOperation>[];
	private readonly random = makeRandom();

	constructor(
		readonly ddsModel: DDSFuzzModel<TChannelFactory, TOperation>,
		readonly providedOptions: Partial<DDSFuzzSuiteOptions>,
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
			// throw an error here rather than silently returning the operations
			// unchanged. a test case that doesn't fail initially indicates an
			// error, either on the part of the user or in the fuzz test runner
			throw new Error("test case doesn't fail.");
		}

		await this.tryDeleteEachOp();

		if (this.transforms.length === 0) {
			return this.operations;
		}

		for (let i = 0; i < this.numIterations; i += 1) {
			await this.applyRandomTransform();
			// some minimizations can only occur if two or more ops are modified
			// at the same time
			await this.applyNRandomTransforms(2);
			await this.applyNRandomTransforms(3);
		}

		await this.tryDeleteEachOp();

		return this.operations;
	}

	private async tryDeleteEachOp(): Promise<void> {
		let idx = this.operations.length - 1;

		while (idx > 0) {
			const deletedOp = this.operations.splice(idx, 1)[0];

			if (!(await this.assertFails())) {
				this.operations.splice(idx, 0, deletedOp);
			}

			idx -= 1;
		}
	}

	private async applyRandomTransform(): Promise<void> {
		const transform = this.random.pick(this.transforms);

		const opIdx = this.random.integer(0, this.operations.length - 1);

		await this.applyTransform(transform, opIdx);
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

		const originalOperations: [TOperation, number][] = [];

		for (let i = 0; i < transforms.length; i++) {
			const transform = transforms[i];
			const op = this.operations[operationIdxs[i]];

			originalOperations.push([
				JSON.parse(JSON.stringify(op)) as TOperation,
				operationIdxs[i],
			]);

			transform(op);
		}

		if (!(await this.assertFails())) {
			for (const [op, idx] of originalOperations) {
				this.operations[idx] = op;
			}
		}
	}

	private async applyTransform(
		transform: MinimizationTransform<TOperation>,
		opIdx: number,
	): Promise<void> {
		if (opIdx >= this.operations.length) {
			throw new Error("invalid op index. this indicates a bug in minimization.");
		}

		const op = this.operations[opIdx];

		// deep clone the op as transforms modify by reference
		const originalOp = JSON.parse(JSON.stringify(op)) as TOperation;

		transform(op);

		if (!(await this.assertFails())) {
			this.operations[opIdx] = originalOp;
		}
	}

	/**
	 * Returns whether or not the test still fails with the same error message.
	 *
	 * We use the simple heuristic of verifying the error message is the same
	 * to avoid dealing with transforms that would result in invalid ops
	 */
	private async assertFails(): Promise<boolean> {
		try {
			await replayTest(
				this.ddsModel,
				this.seed,
				this.operations,
				{
					saveOnFailure: false,
					filepath: this.saveInfo?.filepath,
				},
				this.providedOptions,
			);
			return false;
		} catch (error: unknown) {
			if (!error || !(error instanceof Error)) {
				return false;
			}

			if (this.initialErrorMessage === undefined) {
				this.initialErrorMessage = error.message;
				return true;
			}

			return error.message === this.initialErrorMessage;
		}
	}
}
