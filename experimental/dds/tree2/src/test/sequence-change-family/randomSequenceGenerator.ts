/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { unreachableCase } from "@fluidframework/common-utils";
import { AnchorSet, FieldKey, UpPath } from "../../core";
import { singleTextCursor } from "../../feature-libraries";
import {
	SequenceEditBuilder,
	Transposed as T,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/sequence-change-family";
import { jsonNumber } from "../../domains";
import { testChangeReceiver } from "../utils";

/**
 * @param parentKeys - Keys allowed in the generated path.
 * @param seed - Seed used to randomly select the location for the generated UpPath.
 * @param maxDepth - Maximum depth for the generated path (inclusive).
 * @param maxIndex - Maximum child index for the generated path (inclusive).
 * @returns - A randomly generated UpPath.
 */
export function generateRandomUpPath(
	parentKeys: Set<FieldKey>,
	seed: number,
	maxDepth: number,
	maxIndex: number,
): UpPath {
	const fieldKeys = Array.from(parentKeys);
	const random = makeRandom(seed);
	let path: UpPath = {
		parent: undefined,
		parentField: random.pick(fieldKeys),
		parentIndex: random.integer(0, maxIndex),
	};
	const depth = random.integer(0, maxDepth);
	// loop through to create more upPaths
	for (let i = 0; i <= depth; i++) {
		path = {
			parent: path,
			parentField: random.pick(fieldKeys),
			parentIndex: random.integer(0, maxIndex),
		};
	}

	return path;
}

enum Operation {
	Modify = 0,
	Delete = 1,
	Insert = 2,
}

/**
 * @param seed - Random seed used to generate the change.
 * @param pathGenerator - Generator of random path.
 * @returns Randomly generated change.
 */
export function generateRandomChange(
	seed: number,
	pathGenerator: (seed: number) => UpPath,
): T.LocalChangeset {
	const random = makeRandom(seed);
	const [changeReceiver, getChanges] = testChangeReceiver<T.LocalChangeset>();
	const builder = new SequenceEditBuilder(changeReceiver, new AnchorSet());
	const operation = random.integer(Operation.Modify, Operation.Insert) as Operation;
	switch (operation) {
		case Operation.Modify:
			// builder.setValue(
			// 	pathGenerator(random.integer(0, Number.MAX_SAFE_INTEGER)),
			// 	random.integer(0, Number.MAX_SAFE_INTEGER),
			// );
			break;
		case Operation.Insert:
			builder.insert(
				pathGenerator(random.integer(0, Number.MAX_SAFE_INTEGER)),
				singleTextCursor({
					type: jsonNumber.name,
					value: random.integer(0, Number.MAX_SAFE_INTEGER),
				}),
			);
			break;
		case Operation.Delete:
			builder.delete(
				pathGenerator(random.integer(0, Number.MAX_SAFE_INTEGER)),
				random.integer(1, 10),
			);
			break;
		default:
			unreachableCase(operation);
	}

	return getChanges()[0];
}
