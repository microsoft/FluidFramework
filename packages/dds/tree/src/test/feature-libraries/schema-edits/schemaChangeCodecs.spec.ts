/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import { currentVersion } from "../../../codec/index.js";
import {
	LeafNodeStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
	ValueSchema,
	storedEmptyFieldSchema,
} from "../../../core/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import {
	CompareAndSwapSchemaChangeset,
	FieldKinds,
	makeSchemaChangeCodec,
} from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { WideningSchemaChangeset } from "../../../feature-libraries/schema-change-family/index.js";
import { brand } from "../../../util/index.js";
import { fieldSchema } from "../../utils.js";

describe("schemaChangeCodec", () => {
	const codec = makeSchemaChangeCodec({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: currentVersion,
	});
	const empty: TreeStoredSchema = {
		rootFieldSchema: storedEmptyFieldSchema,
		nodeSchema: new Map(),
	};
	const numberType = brand<TreeNodeSchemaIdentifier>("number");
	const number: TreeStoredSchema = {
		rootFieldSchema: fieldSchema(FieldKinds.optional, [numberType]),
		nodeSchema: new Map([[numberType, new LeafNodeStoredSchema(ValueSchema.Number)]]),
	};

	it("rejects non-CAS changes", () => {
		assert.throws(
			() => codec.encode(new WideningSchemaChangeset(empty, number)),
			validateAssertionError(/Only compare-and-swap schema changes may be encoded/),
		);
	});

	it("rejects conflicted CAS changes", () => {
		assert.throws(
			() => codec.encode(new CompareAndSwapSchemaChangeset(number, number, empty)),
			validateAssertionError(/Conflicted schema changes should never be transmitted/),
		);
	});

	it("rejects inverse CAS changes", () => {
		assert.throws(
			() => codec.encode(new CompareAndSwapSchemaChangeset(empty, number).invert()),
			validateAssertionError(/Inverse schema changes should never be transmitted/),
		);
	});

	it("round-trips a CAS changeset", () => {
		const change = new CompareAndSwapSchemaChangeset(empty, number);
		assert.deepEqual(codec.decode(codec.encode(change)), change);
	});

	it("preserves input metadata rather than original metadata", () => {
		const numberWithMetadata: TreeStoredSchema = {
			...number,
			rootFieldSchema: {
				...number.rootFieldSchema,
				persistedMetadata: { value: 1 },
			},
		};
		const change = new CompareAndSwapSchemaChangeset(numberWithMetadata, empty, number);
		assert.deepEqual(codec.decode(codec.encode(change)).input, numberWithMetadata);
	});
});
