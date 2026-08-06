/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EmptyKey, mapCursorField, type ITreeCursorSynchronous } from "../core/index.js";
import { TreeAlpha } from "../shared-tree/index.js";
import {
	createArrayInsertionAnchor,
	getInnerNode,
	SchemaFactory,
	SchemaFactoryAlpha,
} from "../simple-tree/index.js";
import type { TreeNodeFromImplicitAllowedTypes } from "../simple-tree/index.js";

const sf = new SchemaFactoryAlpha("com.fluidframework.extrinsicRanges");

/**
 * Replace with generic parameter
 */
const RangeData = SchemaFactory.string;

/**
 * Replace with generic parameter
 */
const ArrayData = SchemaFactory.string;

/**
 * @privateRemarks
 * Extra wrapper layer to make schema evolution and API erasure easier.
 */
export class ExtrinsicRangeManager extends sf.object("Manager", {
	content: SchemaFactory.required([() => ExtrinsicRangeManagerInner], { key: EmptyKey }),
}) {}

class ExtrinsicRangeManagerInner extends sf.object("ManagerInner", {
	content: SchemaFactory.required([() => MainArray], { key: EmptyKey }),
	ranges: [() => ExtrinsicRanges],
}) {
	public insertAt(
		index: number,
		additionalCharacters: TreeNodeFromImplicitAllowedTypes<typeof ArrayData>,
	): void {
		this.transactOnContent((content) => {
			content.insertAt(index, additionalCharacters);
		});
	}
	public removeRange(index: number | undefined, end: number | undefined): void {
		this.transactOnContent((content) => {
			content.removeRange(index, end);
		});
	}

	public transactOnContent(edit: (content: MainArray) => void): void {
		TreeAlpha.context(this).runTransaction(
			(): void => {
				const anchors = this.ranges.map((range) => ({
					node: range,
					start: createArrayInsertionAnchor(this.ranges, range.start),
					end: createArrayInsertionAnchor(this.ranges, range.end),
				}));
				edit(this.content);
				for (const anchor of anchors) {
					anchor.node.start = anchor.start.index;
					anchor.node.end = anchor.end.index;
				}
			},
			{
				preconditions: [{ type: "noChange" }],
			},
		);
	}
}

class MainArray extends sf.array("StringArray", ArrayData) {
	public withBorrowedSequenceCursor<T>(f: (cursor: ITreeCursorSynchronous) => T): T {
		const cursor = getInnerNode(this).borrowCursor();
		cursor.enterField(EmptyKey);
		const result = f(cursor);
		cursor.exitField();
		return result;
	}

	public charactersCopy(): string[] {
		return this.withBorrowedSequenceCursor((cursor) =>
			mapCursorField(cursor, () => cursor.value as string),
		);
	}

	public fullString(): string {
		return this.charactersCopy().join("");
	}
}

/**
 * To atomically edit all of these in parallel we can either:
 * 1. Break collab using constraints: ideally we could add a shallow now change constraint on this array so concurrent edits on the main content are allowed, just not current edits of which ranges exist.
 * 2. Use bulk editing
 */
class ExtrinsicRanges extends sf.array("ExtrinsicRanges", [() => ExtrinsicRange]) {}

class ExtrinsicRange extends sf.object("ExtrinsicRange", {
	data: [() => RangeData],

	// Atomically maintaining these can be done without constraints if we add a field kind which allows some math operations which match index behavior:
	// Mainly for:
	// insert: add a specified constant if current value is > a specified value.
	// remove: subtract a specified constant if current value is > a specified value.
	// while the specified values are also updated be rebase like array indexes.
	start: SchemaFactory.number,
	end: SchemaFactory.number,
}) {}
