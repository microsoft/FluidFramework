/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "node:assert";
import type { NodeId } from "../feature-libraries/index.js";
import {
	type ChangeEncodingContext,
	type DeltaFieldMap,
	type FieldKey,
	type FieldKindIdentifier,
	makeAnonChange,
} from "../core/index.js";
import { type JsonCompatibleReadOnly, brand } from "../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { EncodedNodeChangeset } from "../feature-libraries/modular-schema/modularChangeFormat.js";
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

function composeChild(
	id1: NodeId | undefined,
	id2: NodeId | undefined,
	verify: boolean = true,
): TestNodeId {
	const testChange = TestChange.compose(tryGetTestChange(id1), tryGetTestChange(id2), verify);
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
): TestNodeId | undefined {
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

const fieldKey: FieldKey = brand("");
const fieldKind: FieldKindIdentifier = brand("");

function encode(id: NodeId, context: ChangeEncodingContext): EncodedNodeChangeset {
	const encodedId = {
		...id,
		testChange: TestChange.codec.encode((id as TestNodeId).testChange, context),
	};

	return {
		fieldChanges: [{ fieldKey, fieldKind, change: encodedId }],
	};
}

function decode(encoded: JsonCompatibleReadOnly, context: ChangeEncodingContext): NodeId {
	const fieldChanges =
		(encoded as EncodedNodeChangeset).fieldChanges ?? fail("Invalid encoded TestNodeId");

	return fieldChanges[0].change as TestNodeId;
}

function tryGetTestChange(id: NodeId | undefined): TestChange | undefined {
	return (id as TestNodeId | undefined)?.testChange;
}
