/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Any, SchemaBuilder } from "../../../feature-libraries";
import { FieldKey, TreeNavigationResult } from "../../../core";
import { forestWithContent } from "../../utils";
import { brand } from "../../../util";
import {
	LazyOptionalField,
	LazySequence,
	LazyValueField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree-2/lazyField";
import { getReadonlyContext } from "./utils";

const detachedField: FieldKey = brand("detached");
const detachedFieldAnchor = { parent: undefined, fieldKey: detachedField };

describe("lazyField", () => {
	it("LazyField implementations do not allow edits to detached trees", () => {
		const builder = new SchemaBuilder("lazyTree");
		builder.struct("empty", {});
		const schema = builder.intoDocumentSchema(SchemaBuilder.fieldOptional(Any));
		const forest = forestWithContent({ schema, initialTree: {} });
		const context = getReadonlyContext(forest, schema);
		const cursor = context.forest.allocateCursor();
		assert.equal(
			forest.tryMoveCursorToField({ fieldKey: detachedField, parent: undefined }, cursor),
			TreeNavigationResult.Ok,
		);
		const sequenceField = new LazySequence(
			context,
			SchemaBuilder.fieldSequence(Any),
			cursor,
			detachedFieldAnchor,
		);
		const optionalField = new LazyOptionalField(
			context,
			SchemaBuilder.fieldOptional(Any),
			cursor,
			detachedFieldAnchor,
		);
		const valueField = new LazyValueField(
			context,
			SchemaBuilder.fieldValue(Any),
			cursor,
			detachedFieldAnchor,
		);
		cursor.free();
		assert.throws(
			() => sequenceField.replaceRange(0, 1, []),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
		assert.throws(
			() => optionalField.setContent(undefined),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
		assert.throws(
			() => valueField.setContent({}),
			/only allowed on fields with TreeStatus.InDocument status/,
		);
	});
});
