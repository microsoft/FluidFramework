/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { currentVersion, type CodecWriteOptions } from "../../codec/index.js";
import { type TreeStoredSchema, rootFieldKey } from "../../core/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { forbidden } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	type ModularChangeset,
	fieldKinds,
	type SchemaChange,
	FieldBatchFormatVersion,
	type FieldBatchCodec,
} from "../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { isAuditableFromOutcome } from "../../shared-tree/isAuditableFromOutcome.js";
import type {
	SharedTreeChange,
	SharedTreeInnerChange,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../shared-tree/sharedTreeChangeTypes.js";
import { ajvValidator } from "../codec/index.js";
import { chunkFromJsonTrees, failCodecFamily, mintRevisionTag } from "../utils.js";

const codecOptions = {
	jsonValidator: ajvValidator,
	minVersionForCollab: currentVersion,
} as const satisfies CodecWriteOptions;
const fieldBatchCodec = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
	writeVersion: FieldBatchFormatVersion.v2,
} as const satisfies FieldBatchCodec;

const modularFamily = new ModularChangeFamily(fieldKinds, failCodecFamily, codecOptions);
const dataChanges: ModularChangeset[] = [];
const editor = new DefaultEditBuilder(
	modularFamily,
	mintRevisionTag,
	(taggedChange) => dataChanges.push(taggedChange.change),
	codecOptions,
);

const rootField = { parent: undefined, field: rootFieldKey };
editor.valueField(rootField).set(chunkFromJsonTrees(["X"]));
editor.valueField(rootField).set(chunkFromJsonTrees(["Y"]));

const dataChangeA = dataChanges[0];
const dataChangeB = dataChanges[1];

const emptySchema = {
	nodeSchema: new Map(),
	rootFieldSchema: {
		kind: forbidden.identifier,
		types: new Set(),
		persistedMetadata: undefined,
	},
} as const satisfies TreeStoredSchema;
const innerSchemaChange = {
	schema: { new: emptySchema, old: emptySchema },
	isInverse: false,
} as const satisfies SchemaChange;

const dataInner = (change: ModularChangeset): SharedTreeInnerChange => ({
	type: "data",
	innerChange: change,
});
const schemaInner = {
	type: "schema",
	innerChange: innerSchemaChange,
} as const satisfies SharedTreeInnerChange;

describe("isAuditableFromOutcome", () => {
	it("returns true for an empty change", () => {
		const change = { changes: [] } as const satisfies SharedTreeChange;
		assert.equal(isAuditableFromOutcome(change), true);
	});

	it("returns true for a single data change with no violated constraints", () => {
		const change = { changes: [dataInner(dataChangeA)] } as const satisfies SharedTreeChange;
		assert.equal(isAuditableFromOutcome(change), true);
	});

	it("returns true when a data change has constraintViolationCount explicitly 0", () => {
		const change = {
			changes: [dataInner({ ...dataChangeA, constraintViolationCount: 0 })],
		} as const satisfies SharedTreeChange;
		assert.equal(isAuditableFromOutcome(change), true);
	});

	it("returns false when the change contains more than one inner change", () => {
		const change = {
			changes: [dataInner(dataChangeA), dataInner(dataChangeB)],
		} as const satisfies SharedTreeChange;
		assert.equal(isAuditableFromOutcome(change), false);
	});

	it("returns false for a single schema change", () => {
		const change: SharedTreeChange = { changes: [schemaInner] };
		assert.equal(isAuditableFromOutcome(change), false);
	});

	it("returns false when the change contains a schema change interleaved with a data change", () => {
		const change: SharedTreeChange = {
			changes: [dataInner(dataChangeA), schemaInner],
		};
		assert.equal(isAuditableFromOutcome(change), false);
	});

	it("returns false when a single data change has violated constraints", () => {
		const change: SharedTreeChange = {
			changes: [dataInner({ ...dataChangeA, constraintViolationCount: 1 })],
		};
		assert.equal(isAuditableFromOutcome(change), false);
	});
});
