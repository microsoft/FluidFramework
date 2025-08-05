/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import { validateFuzzTreeConsistency } from "../../utils.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import { SharedTreeFuzzTestFactory, createOnCreate } from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";
import { takeAsync } from "@fluid-private/stochastic-test-utils";
import { type EditGeneratorOpWeights, makeOpGenerator } from "./fuzzEditGenerators.js";
import { FluidClientVersion } from "../../../codec/index.js";

export const runsPerBatch = 50;
// TODO: Enable other types of ops.
// AB#11436: Currently manually disposing the view when applying the schema op is causing a double dispose issue. Once this issue has been resolved, re-enable schema ops.
const editGeneratorOpWeights: Partial<EditGeneratorOpWeights> = {
	set: 3,
	clear: 1,
	insert: 5,
	remove: 5,
	intraFieldMove: 5,
	crossFieldMove: 5,
	start: 1,
	commit: 1,
	abort: 1,
	fieldSelection: { optional: 1, required: 1, sequence: 3, recurse: 3 },
	schema: 0,
	nodeConstraint: 3,
	fork: 1,
	merge: 1,
};
const generatorFactory = () => takeAsync(100, makeOpGenerator(editGeneratorOpWeights));

export const baseTreeModel: DDSFuzzModel<
	SharedTreeFuzzTestFactory,
	Operation,
	DDSFuzzTestState<SharedTreeFuzzTestFactory>
> = {
	workloadName: "SharedTree",
	factory: new SharedTreeFuzzTestFactory(createOnCreate(undefined), undefined, {
		oldestCompatibleClient: FluidClientVersion.EnableUnstableFeatures,
	}),
	generatorFactory,
	reducer: fuzzReducer,
	validateConsistency: validateFuzzTreeConsistency,
};
