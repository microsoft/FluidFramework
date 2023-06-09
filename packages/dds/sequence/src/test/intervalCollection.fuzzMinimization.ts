/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { readFileSync, writeFileSync } from "fs";
import {
	AsyncGenerator as Generator,
	asyncGeneratorFromArray as generatorFromArray,
	makeRandom,
} from "@fluid-internal/stochastic-test-utils";
import { DDSFuzzModel, replayTest } from "@fluid-internal/test-dds-utils";
import { SharedStringFactory } from "../sequenceFactory";
import { LoggingInfo, Operation, FuzzTestState, makeReducer } from "./intervalCollection.fuzzUtils";
import { assertEquivalentSharedStrings } from "./intervalUtils";

const directory = path.join(__dirname, "../../src/test/results/default-interval-collection");

function getPath(seed: number): string {
	return path.join(directory, `${seed}.json`);
}

export function minimizeTestFromFailureFile(seed: number, loggingInfo?: LoggingInfo) {
	if (Number.isNaN(seed)) {
		return;
	}

	it(`minimize test ${seed}`, async function () {
		this.timeout(10_000);
		const filepath = getPath(seed);
		const operations: Operation[] = JSON.parse(readFileSync(filepath).toString());

		const pass_manager = new PassManager(operations, seed);

		if (!(await pass_manager.runTest())) {
			throw new Error(`Seed ${seed} doesn't crash`);
		}

		await pass_manager.deleteOps();

		for (let i = 0; i < 1000; i += 1) {
			await pass_manager.applyRandomPass();
			await pass_manager.applyTwoRandomlySingle();
			await pass_manager.applyThreeRandomlySingle();
		}

		await pass_manager.deleteOps();

		writeFileSync(filepath, JSON.stringify(pass_manager.operations, null, 2));
	});
}

interface OpMinimizationPass {
	applyTo: (op: Operation) => void;
	undo: (op: Operation) => void;
}

export class PassManager {
	constructor(readonly original_operations: Operation[], readonly seed: number) {}

	random = makeRandom();

	static cloneArray<T>(arr: T[]): T[] {
		return JSON.parse(JSON.stringify(arr)) as T[];
	}

	operations: Operation[] = PassManager.cloneArray(this.original_operations);

	async applyRandomPass() {
		const passes = [
			this.deleteOps.bind(this),
			this.reduceStrings.bind(this),
			this.shiftDown.bind(this),
			this.shrinkRange.bind(this),
			this.swapOps.bind(this),
		];

		const pass = this.random.pick(passes);

		await pass();
	}

	async applyTwoRandomlySingle() {
		if (this.operations.length < 2) {
			return;
		}

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const op1 = this.random.pick(this.operations);
			const op2 = this.random.pick(this.operations);

			if (op1 === op2) {
				continue;
			}

			const passes = [this._reduceString, this._shiftDown, this._shrinkRange];

			const pass1 = this.random.pick(passes);
			const pass2 = this.random.pick(passes);

			pass1.applyTo(op1);
			pass2.applyTo(op2);

			if (!(await this.runTest())) {
				pass1.undo(op1);
				pass2.undo(op2);
			}

			break;
		}
	}

	async applyThreeRandomlySingle() {
		if (this.operations.length < 3) {
			return;
		}

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const op1 = this.random.pick(this.operations);
			const op2 = this.random.pick(this.operations);
			const op3 = this.random.pick(this.operations);

			if (op1 === op2 || op1 === op3 || op2 === op3) {
				continue;
			}

			const passes = [this._reduceString, this._shiftDown, this._shrinkRange];

			const pass1 = this.random.pick(passes);
			const pass2 = this.random.pick(passes);
			const pass3 = this.random.pick(passes);

			pass1.applyTo(op1);
			pass2.applyTo(op2);
			pass3.applyTo(op3);

			if (!(await this.runTest())) {
				pass1.undo(op1);
				pass2.undo(op2);
				pass3.undo(op3);
			}

			break;
		}
	}

	/**
	 * Remove ops to see if the error continues to reproduce
	 */
	async deleteOps() {
		let idx = this.operations.length - 1;

		while (idx > 0) {
			const deletedOp = this.operations.splice(idx, 1)[0];

			if (!(await this.runTest())) {
				this.operations.splice(idx, 0, deletedOp);
			}

			idx -= 1;
		}
	}

	async reduceStrings() {
		for (const op of this.operations) {
			await this.reduceStringSingle(op);
		}
	}

	_reduceString: OpMinimizationPass = {
		applyTo: (op: Operation) => {
			if (op.type !== "addText") {
				return;
			}

			op.content = op.content.slice(1);
		},
		undo: (op: Operation) => {
			if (op.type !== "addText") {
				return;
			}

			op.content += this.random.string(1);
		},
	};

	_shiftDown: OpMinimizationPass = {
		applyTo(op) {
			switch (op.type) {
				case "addText":
					op.index -= 1;
					break;
				case "removeRange":
				case "addInterval":
					op.start -= 1;
					op.end -= 1;
					break;
				default:
					break;
			}
		},
		undo(op) {
			switch (op.type) {
				case "addText":
					op.index += 1;
					break;
				case "removeRange":
				case "addInterval":
					op.start += 1;
					op.end += 1;
					break;
				default:
					break;
			}
		},
	};

	_shrinkRange: OpMinimizationPass = {
		applyTo(op) {
			if (op.type !== "removeRange" && op.type !== "addInterval") {
				return;
			}

			op.end -= 1;
		},
		undo(op) {
			if (op.type !== "removeRange" && op.type !== "addInterval") {
				return;
			}
			op.end += 1;
		},
	};

	async reduceStringSingle(op: Operation) {
		if (op.type !== "addText") {
			return;
		}

		while (op.content.length > 0) {
			const oldText = op.content;
			op.content = op.content.slice(1);

			if (!(await this.runTest())) {
				op.content = oldText;
				break;
			}
		}
	}

	async swapOps() {
		const op1Idx = this.random.integer(0, this.operations.length - 1);
		const op2Idx = this.random.integer(0, this.operations.length - 1);

		this.operations[op1Idx] = this.operations.splice(op2Idx, 1, this.operations[op1Idx])[0];

		if (!(await this.runTest())) {
			this.operations[op1Idx] = this.operations.splice(op2Idx, 1, this.operations[op1Idx])[0];
		}
	}

	async shiftDown() {
		for (const op of this.operations) {
			await this.shiftDownSingle(op);
		}
	}

	async shiftDownSingle(op: Operation) {
		switch (op.type) {
			case "addText":
				while (op.index > 0) {
					op.index -= 1;
					if (!(await this.runTest())) {
						op.index += 1;
						break;
					}
				}
				break;
			case "removeRange":
			case "addInterval":
				while (op.start > 0) {
					op.start -= 1;
					op.end -= 1;
					if (!(await this.runTest())) {
						op.start += 1;
						op.end += 1;
						break;
					}
				}
			default:
				break;
		}
	}

	async shrinkRange() {
		for (const op of this.operations) {
			await this.shrinkRangeSingle(op);
		}
	}

	async shrinkRangeSingle(op: Operation) {
		if (op.type === "removeRange" || op.type === "addInterval") {
			while (op.start < op.end) {
				op.end -= 1;
				if (!(await this.runTest())) {
					op.end += 1;
					break;
				}
			}
		}
	}

	numClients = 3;
	path = getPath(this.seed);

	/**
	 * Returns true if the current operations reproduce a crash
	 */
	async runTest(): Promise<boolean> {
		const ddsModel: DDSFuzzModel<SharedStringFactory, Operation, FuzzTestState> = {
			workloadName: "default interval collection",
			generatorFactory: (): Generator<Operation, unknown> =>
				generatorFromArray(this.operations),
			reducer: makeReducer(),
			validateConsistency: assertEquivalentSharedStrings,
			factory: new SharedStringFactory(),
		};

		try {
			await replayTest(ddsModel, this.seed, this.operations, {
				saveOnFailure: false,
				filepath: this.path,
			});
			return false;
		} catch (e: any) {
			// ignore these errors as they generally don't indicate a bug in the program,
			// but rather malformed input/operations
			if (
				e?.message === "RangeOutOfBounds" ||
				e?.message === "Non-transient references need segment"
			) {
				return false;
			}
			return true;
		}
	}
}
