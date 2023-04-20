/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import path from "path";
import {
	AsyncGenerator,
	takeAsync as take,
	IRandom,
	SaveInfo,
} from "@fluid-internal/stochastic-test-utils";
import { JsonableTree, fieldSchema, SchemaData, rootFieldKey } from "../../../core";
import { FieldKinds, namedTreeSchema } from "../../../feature-libraries";
import { brand } from "../../../util";
import { FuzzTestState, Operation, EditGeneratorOpWeights } from "./fuzzEditGenerators";

export function runFuzzBatch(
	opGenerator: (
		editGeneratorOpWeights?: EditGeneratorOpWeights,
	) => AsyncGenerator<Operation, FuzzTestState>,
	fuzzActions: (
		generatorFactory: AsyncGenerator<Operation, FuzzTestState>,
		seed: number,
		saveInfo?: SaveInfo,
	) => Promise<FuzzTestState>,
	opsPerRun: number,
	runsPerBatch: number,
	random: IRandom,
	editGeneratorOpWeights?: EditGeneratorOpWeights,
): void {
	const seed = random.integer(1, 1000000);
	for (let i = 0; i < runsPerBatch; i++) {
		const runSeed = seed + i;
		const generatorFactory = () => take(opsPerRun, opGenerator(editGeneratorOpWeights));
		const saveInfo: SaveInfo = {
			saveOnFailure: false, // Change to true to save failing runs.
			saveOnSuccess: false, // Change to true to save successful runs.
			filepath: path.join(__dirname, `fuzz-tests-saved-ops/ops_with_seed_${runSeed}`),
		};
		it(`with seed ${runSeed}`, async () => {
			await fuzzActions(generatorFactory(), runSeed, saveInfo);
		}).timeout(20000);
	}
}

export const initialTreeState: JsonableTree = {
	type: brand("Node"),
	fields: {
		foo: [
			{ type: brand("Number"), value: 0 },
			{ type: brand("Number"), value: 1 },
			{ type: brand("Number"), value: 2 },
		],
		foo2: [
			{ type: brand("Number"), value: 3 },
			{ type: brand("Number"), value: 4 },
			{ type: brand("Number"), value: 5 },
		],
	},
};

const rootFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
	name: brand("TestValue"),
	extraLocalFields: fieldSchema(FieldKinds.sequence),
});

export const testSchema: SchemaData = {
	treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
	globalFieldSchema: new Map([[rootFieldKey, rootFieldSchema]]),
};
