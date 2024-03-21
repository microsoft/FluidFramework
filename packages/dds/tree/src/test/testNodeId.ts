/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "assert";
import { NodeId } from "../feature-libraries/index.js";
import { ChangeEncodingContext, DeltaFieldMap, makeAnonChange } from "../core/index.js";
import { JsonCompatibleReadOnly } from "../index.js";
import { TestChange } from "./testChange.js";

/**
 * A NodeId containing a TestChange.
 * This is intended for the purpose of testing that `FieldChangeRebaser`s correctly handle child nodes.
 */
export interface TestNodeId extends NodeId {
	readonly testChange: TestChange;
}

export const TestNodeId = {
	composeChild,
	rebaseChild,
	deltaFromChild,
	create,
	encode,
	decode,
};

function create(id: NodeId, testChange: TestChange): TestNodeId {
	return { ...id, testChange };
}

function composeChild(id1: NodeId | undefined, id2: NodeId | undefined): NodeId {
	const testChange = TestChange.compose(tryGetTestChange(id1), tryGetTestChange(id2));
	const resultId = id1 ?? id2 ?? fail("Should not compose two undefined IDs");
	const composed: TestNodeId = {
		...resultId,
		testChange,
	};

	return composed;
}

function rebaseChild(
	idToRebase: NodeId | undefined,
	baseId: NodeId | undefined,
): NodeId | undefined {
	const testChange = TestChange.rebase(tryGetTestChange(idToRebase), tryGetTestChange(baseId));
	const resultId = idToRebase ?? baseId ?? fail("Should not rebase two undefined IDs");
	if (testChange === undefined) {
		return undefined;
	}

	const rebased: TestNodeId = {
		...resultId,
		testChange,
	};

	return rebased;
}

function deltaFromChild(id: NodeId): DeltaFieldMap {
	const testChange = (id as TestNodeId).testChange;
	return TestChange.toDelta(makeAnonChange(testChange));
}

function encode(id: NodeId, context: ChangeEncodingContext): JsonCompatibleReadOnly {
	return {
		...id,
		testChange: TestChange.codec.encode((id as TestNodeId).testChange, context),
	};
}

function decode(encoded: JsonCompatibleReadOnly, context: ChangeEncodingContext): NodeId {
	return encoded as unknown as TestNodeId;
}

function tryGetTestChange(id: NodeId | undefined): TestChange | undefined {
	return (id as TestNodeId | undefined)?.testChange;
}
