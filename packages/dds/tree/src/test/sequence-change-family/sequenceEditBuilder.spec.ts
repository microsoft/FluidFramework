/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { AnchorSet, Delta, FieldKey, ITreeCursorSynchronous, UpPath } from "../../core";
import { singleTextCursor } from "../../feature-libraries";
import {
	sequenceChangeFamily,
	SequenceEditBuilder,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/sequence-change-family";
import { brand, brandOpaque } from "../../util";

const rootKey = brand<FieldKey>("root");
const detachedKey = brand<FieldKey>("detached");
const fooKey = brand<FieldKey>("foo");
const barKey = brand<FieldKey>("bar");

const root: UpPath = {
	parent: undefined,
	parentField: rootKey,
	parentIndex: 0,
};

const detached: UpPath = {
	parent: undefined,
	parentField: detachedKey,
	parentIndex: 0,
};

const root_foo2: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 2,
};

const root_bar2: UpPath = {
	parent: root,
	parentField: barKey,
	parentIndex: 2,
};

const root_foo17: UpPath = {
	parent: root,
	parentField: fooKey,
	parentIndex: 17,
};

const root_foo2_foo5: UpPath = {
	parent: root_foo2,
	parentField: fooKey,
	parentIndex: 5,
};

const root_foo17_foo5: UpPath = {
	parent: root_foo17,
	parentField: fooKey,
	parentIndex: 5,
};

const root_bar2_bar5: UpPath = {
	parent: root_bar2,
	parentField: barKey,
	parentIndex: 5,
};

const root_foo2_foo5_foo7: UpPath = {
	parent: root_foo2_foo5,
	parentField: fooKey,
	parentIndex: 7,
};

const root_bar2_bar5_bar7: UpPath = {
	parent: root_bar2_bar5,
	parentField: barKey,
	parentIndex: 7,
};

const nodeX = { type: jsonString.name, value: "X" };
const nodeXCursor: ITreeCursorSynchronous = singleTextCursor(nodeX);
const moveId = brandOpaque<Delta.MoveId>(0);
const moveId2 = brandOpaque<Delta.MoveId>(1);

function makeBuilderToDeltas(): {
	deltas: Delta.Root[];
	builder: SequenceEditBuilder;
} {
	const deltas: Delta.Root[] = [];
	const builder = new SequenceEditBuilder(
		(change) => deltas.push(sequenceChangeFamily.intoDelta(change)),
		new AnchorSet(),
	);
	return { deltas, builder };
}

describe("SequenceEditBuilder", () => {
	it("Does not produces changes if no editing calls are made to it", () => {
		const { deltas } = makeBuilderToDeltas();
		assert.deepEqual(deltas, []);
	});

	it("Can set the root node value", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		builder.setValue(root, 42);
		const expected: Delta.Root = new Map([
			[
				rootKey,
				{
					beforeShallow: [{ index: 0, setValue: 42 }],
				},
			],
		]);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can set a child node value", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 5, setValue: 42 }],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[fooKey, innerFooDelta]]) }],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, outerFooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.setValue(root_foo2_foo5, 42);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can insert a root node", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const expected: Delta.Root = new Map([
			[
				rootKey,
				{
					shallow: [
						{
							type: Delta.MarkType.Insert,
							content: [nodeXCursor],
						},
					],
				},
			],
		]);
		builder.insert(root, singleTextCursor(nodeX));
		assert.deepEqual(deltas, [expected]);
	});

	it("Can insert a child node", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDelta: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.Insert,
					content: [nodeXCursor],
				},
			],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[fooKey, innerFooDelta]]) }],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, outerFooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.insert(root_foo2_foo5, singleTextCursor(nodeX));
		assert.deepEqual(deltas, [expected]);
	});

	it("Can delete a root node", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const expected: Delta.Root = new Map([
			[
				rootKey,
				{
					shallow: [
						{
							type: Delta.MarkType.Delete,
							count: 1,
						},
					],
				},
			],
		]);
		builder.delete(root, 1);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can delete child nodes", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDelta: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.Delete,
					count: 10,
				},
			],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[fooKey, innerFooDelta]]) }],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, outerFooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.delete(root_foo2_foo5, 10);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes to the right within a field", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 10,
				},
				5,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 10,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, fooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2, 10, root_foo17);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes to the left within a field", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 10,
				},
				15,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 10,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, fooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo17, 10, root_foo2);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes into their own midst", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 15,
				},
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 15,
				},
				{
					type: Delta.MarkType.MoveIn,
					moveId: moveId2,
					count: 5,
				},
				{
					type: Delta.MarkType.MoveOut,
					moveId: moveId2,
					count: 5,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, fooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2, 20, root_foo17);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes across fields of the same parent", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 10,
				},
			],
		};
		const barDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 10,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [
				{
					index: 0,
					fields: new Map([
						[fooKey, fooDelta],
						[barKey, barDelta],
					]),
				},
			],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2, 10, root_bar2);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes to the right across subtrees of the same field", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDeltaSrc: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 3,
				},
			],
		};
		const innerFooDeltaDst: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 3,
				},
			],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [
				{ index: 2, fields: new Map([[fooKey, innerFooDeltaSrc]]) },
				{ index: 17, fields: new Map([[fooKey, innerFooDeltaDst]]) },
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, outerFooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2_foo5, 3, root_foo17_foo5);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes to the left across subtrees of the same field", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDeltaSrc: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 3,
				},
			],
		};
		const innerFooDeltaDst: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 3,
				},
			],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [
				{ index: 2, fields: new Map([[fooKey, innerFooDeltaDst]]) },
				{ index: 17, fields: new Map([[fooKey, innerFooDeltaSrc]]) },
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, outerFooDelta]]) }],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo17_foo5, 3, root_foo2_foo5);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes across subtrees of different fields", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDeltaSrc: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 3,
				},
			],
		};
		const innerBarDeltaDst: Delta.FieldChanges = {
			shallow: [
				5,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 3,
				},
			],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[fooKey, innerFooDeltaSrc]]) }],
		};
		const outerBarDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[barKey, innerBarDeltaDst]]) }],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [
				{
					index: 0,
					fields: new Map([
						[fooKey, outerFooDelta],
						[barKey, outerBarDelta],
					]),
				},
			],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2_foo5, 3, root_bar2_bar5);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes across deep subtrees of different fields", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const innerFooDeltaSrc: Delta.FieldChanges = {
			shallow: [
				7,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 3,
				},
			],
		};
		const innerBarDeltaDst: Delta.FieldChanges = {
			shallow: [
				7,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 3,
				},
			],
		};
		const midFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 5, fields: new Map([[fooKey, innerFooDeltaSrc]]) }],
		};
		const midBarDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 5, fields: new Map([[barKey, innerBarDeltaDst]]) }],
		};
		const outerFooDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[fooKey, midFooDelta]]) }],
		};
		const outerBarDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 2, fields: new Map([[barKey, midBarDelta]]) }],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [
				{
					index: 0,
					fields: new Map([
						[fooKey, outerFooDelta],
						[barKey, outerBarDelta],
					]),
				},
			],
		};
		const expected: Delta.Root = new Map([[rootKey, rootDelta]]);
		builder.move(root_foo2_foo5_foo7, 3, root_bar2_bar5_bar7);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes to a detached tree", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 10,
				},
			],
		};
		const detachedDelta: Delta.FieldChanges = {
			shallow: [
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 10,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, fooDelta]]) }],
		};
		const expected: Delta.Root = new Map([
			[rootKey, rootDelta],
			[detachedKey, detachedDelta],
		]);
		builder.move(root_foo2, 10, detached);
		assert.deepEqual(deltas, [expected]);
	});

	it("Can move nodes from a detached tree", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const fooDelta: Delta.FieldChanges = {
			shallow: [
				2,
				{
					type: Delta.MarkType.MoveIn,
					moveId,
					count: 10,
				},
			],
		};
		const detachedDelta: Delta.FieldChanges = {
			shallow: [
				{
					type: Delta.MarkType.MoveOut,
					moveId,
					count: 10,
				},
			],
		};
		const rootDelta: Delta.FieldChanges = {
			beforeShallow: [{ index: 0, fields: new Map([[fooKey, fooDelta]]) }],
		};
		const expected: Delta.Root = new Map([
			[rootKey, rootDelta],
			[detachedKey, detachedDelta],
		]);
		builder.move(detached, 10, root_foo2);
		assert.deepEqual(deltas, [expected]);
	});

	it("Produces one delta for each editing call made to it", () => {
		const { builder, deltas } = makeBuilderToDeltas();
		const expected: Delta.Root[] = [];

		builder.setValue(root, 42);
		expected.push(
			new Map([
				[
					rootKey,
					{
						beforeShallow: [{ index: 0, setValue: 42 }],
					},
				],
			]),
		);
		assert.deepEqual(deltas, expected);

		builder.setValue(root, 43);
		expected.push(
			new Map([
				[
					rootKey,
					{
						beforeShallow: [{ index: 0, setValue: 43 }],
					},
				],
			]),
		);
		assert.deepEqual(deltas, expected);

		builder.setValue(root, 44);
		expected.push(
			new Map([
				[
					rootKey,
					{
						beforeShallow: [{ index: 0, setValue: 44 }],
					},
				],
			]),
		);
		assert.deepEqual(deltas, expected);
	});
});
