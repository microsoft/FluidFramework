/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { Any, SchemaBuilder } from "../../../feature-libraries";
import { FieldAnchor, FieldKey, TreeNavigationResult, UpPath } from "../../../core";
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
	it("Querying the path for editing throws for detached trees", () => {
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
		const parentNodePath: UpPath = {
			parent: undefined,
			parentField: detachedField,
			parentIndex: 0,
		};
		const parentAnchor = forest.anchors.track(parentNodePath);
		const nestedFieldAnchor: FieldAnchor = {
			parent: parentAnchor,
			fieldKey: brand("nested"),
		};
		const fields = [
			new LazySequence(
				context,
				SchemaBuilder.fieldSequence(Any),
				cursor,
				detachedFieldAnchor,
			),
			new LazySequence(context, SchemaBuilder.fieldSequence(Any), cursor, nestedFieldAnchor),
			new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				detachedFieldAnchor,
			),
			new LazyOptionalField(
				context,
				SchemaBuilder.fieldOptional(Any),
				cursor,
				nestedFieldAnchor,
			),
			new LazyValueField(context, SchemaBuilder.fieldValue(Any), cursor, detachedFieldAnchor),
			new LazyValueField(context, SchemaBuilder.fieldValue(Any), cursor, nestedFieldAnchor),
		];
		cursor.free();
		for (const field of fields) {
			assert.throws(
				() => field.getFieldPathForEditing(),
				/only allowed on fields with TreeStatus.InDocument status/,
			);
		}
	});
});
