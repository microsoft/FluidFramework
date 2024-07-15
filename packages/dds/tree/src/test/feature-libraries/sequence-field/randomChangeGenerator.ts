/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import { type NodeId, SequenceField as SF } from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";

enum Operation {
	EditChild = 0,
	Remove = 1,
	Insert = 2,
}

/**
 * @param seed - Random seed used to generate the change.
 * @param maxIndex - Maximum child index for the generated change.
 * @returns Randomly generated change.
 */
export function generateRandomChange(
	seed: number,
	maxIndex: number,
	childChangeGenerator: (seed: number) => NodeId,
): SF.Changeset {
	const random = makeRandom(seed);
	const builder = SF.sequenceFieldEditor;
	const operation = random.integer(Operation.EditChild, Operation.Insert) as Operation;
	switch (operation) {
		case Operation.EditChild:
			return builder.buildChildChange(
				random.integer(0, maxIndex),
				childChangeGenerator(random.integer(0, Number.MAX_SAFE_INTEGER)),
			);
		case Operation.Insert:
			return builder.insert(random.integer(0, maxIndex), 1, brand(0));
		case Operation.Remove:
			return builder.remove(random.integer(0, maxIndex), random.integer(1, 10), brand(0));
		default:
			unreachableCase(operation);
	}
}
