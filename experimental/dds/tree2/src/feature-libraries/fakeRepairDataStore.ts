/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKey, RepairDataStore, RevisionTag, TreeSchemaIdentifier, UpPath } from "../core";
import { brand, makeArray } from "../util";
import { singleTextCursor } from "./treeTextCursor";

const DUMMY_REVIVED_NODE_TYPE: TreeSchemaIdentifier = brand("DummyRevivedNode");
const DUMMY_REVIVED_VALUE: TreeSchemaIdentifier = brand("DummyRevivedValue");

/**
 * A `RepairDataStore` implementation that returns dummy content.
 */
export const dummyRepairDataStore: RepairDataStore<undefined> = {
	capture: () => {},
	getNodes: (
		revision: RevisionTag,
		path: UpPath | undefined,
		field: FieldKey,
		index: number,
		count: number,
	) => makeArray(count, () => singleTextCursor({ type: DUMMY_REVIVED_NODE_TYPE })),
	getValue: (revision: RevisionTag, path: UpPath) => {
		return DUMMY_REVIVED_VALUE;
	},
};
