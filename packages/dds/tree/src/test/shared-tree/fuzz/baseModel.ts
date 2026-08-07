/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync, type AsyncGenerator } from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";

import { pkgVersion } from "../../../packageVersion.js";
import { ForestTypeExpensiveDebug, ForestTypeReference } from "../../../shared-tree/index.js";
import type { ISharedTree } from "../../../treeFactory.js";
import { validateFuzzTreeConsistency } from "../../utils.js";

import { type EditGeneratorOpWeights, makeOpGenerator } from "./fuzzEditGenerators.js";
import { fuzzReducer } from "./fuzzEditReducers.js";
import { SharedTreeFuzzTestFactory, createOnCreate } from "./fuzzUtils.js";
import type { Operation } from "./operationTypes.js";

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
const generatorFactory = (): AsyncGenerator<
	Operation,
	DDSFuzzTestState<IChannelFactory<ISharedTree>>
> => takeAsync(100, makeOpGenerator(editGeneratorOpWeights));

export const baseTreeModel: DDSFuzzModel<
	SharedTreeFuzzTestFactory,
	Operation,
	DDSFuzzTestState<SharedTreeFuzzTestFactory>
> = {
	workloadName: "SharedTree (Reference Forest)",
	factory: new SharedTreeFuzzTestFactory(createOnCreate(undefined), undefined, {
		minVersionForCollab: pkgVersion,
		forest: ForestTypeReference,
	}),
	generatorFactory,
	reducer: fuzzReducer,
	validateConsistency: validateFuzzTreeConsistency,
};

/**
 * Fuzz model that uses {@link ForestTypeExpensiveDebug}, which is backed by a `ComparisonForest`.
 * @remarks
 * This exercises the optimized `ChunkedForest` while asserting, after every delta, that its contents match a
 * reference `ObjectForest`. It provides cross-implementation validation of the optimized forest against randomized edits.
 */
export const comparisonForestTreeModel: DDSFuzzModel<
	SharedTreeFuzzTestFactory,
	Operation,
	DDSFuzzTestState<SharedTreeFuzzTestFactory>
> = {
	workloadName: "SharedTree (Comparison Forest)",
	factory: new SharedTreeFuzzTestFactory(createOnCreate(undefined), undefined, {
		minVersionForCollab: pkgVersion,
		forest: ForestTypeExpensiveDebug,
	}),
	generatorFactory,
	reducer: fuzzReducer,
	validateConsistency: validateFuzzTreeConsistency,
};
