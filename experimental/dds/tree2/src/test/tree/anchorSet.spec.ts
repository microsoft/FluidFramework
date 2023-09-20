/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import {
	Anchor,
	AnchorNode,
	AnchorSet,
	Delta,
	FieldKey,
	JsonableTree,
	PathVisitor,
	UpPath,
	clonePath,
	rootFieldKey,
	applyDelta,
} from "../../core";
import { brand } from "../../util";
import { expectEqualPaths } from "../utils";
import { jsonString } from "../../domains";

const fieldFoo: FieldKey = brand("foo");
const fieldBar: FieldKey = brand("bar");
const fieldBaz: FieldKey = brand("baz");
const node: JsonableTree = { type: brand("A"), value: "X" };

const path1 = makePath([fieldFoo, 5], [fieldBar, 4]);
const path2 = makePath([fieldFoo, 3], [fieldBaz, 2]);
const path3 = makePath([fieldFoo, 4]);
const path4 = makePath([fieldFoo, 5]);

describe("AnchorSet", () => {
	it("preserves paths", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		checkEquality(anchors.locate(anchor1), path1);
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
	});

	it("can move within field", () => {
		const anchors = new AnchorSet();
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const anchor1 = anchors.track(makePath([rootFieldKey, 1]));
		const anchor2 = anchors.track(makePath([rootFieldKey, 2]));
		const anchor3 = anchors.track(makePath([rootFieldKey, 3]));

		// start with 0123 then move 1 so the order is 0213

		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(1),
		};

		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(1),
		};

		const delta = new Map([[rootFieldKey, [1, moveOut, 1, moveIn]]]);
		applyDelta(delta, anchors);
		checkEquality(anchors.locate(anchor0), makePath([rootFieldKey, 0]));
		checkEquality(anchors.locate(anchor1), makePath([rootFieldKey, 2]));
		checkEquality(anchors.locate(anchor2), makePath([rootFieldKey, 1]));
		checkEquality(anchors.locate(anchor3), makePath([rootFieldKey, 3]));
	});

	it("can rebase over insert", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();

		const insert = {
			type: Delta.MarkType.Insert,
			content: [node, node].map(singleTextCursor),
		};

		applyDelta(makeDelta(insert, makePath([fieldFoo, 4])), anchors);

		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 7], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), makePath([fieldFoo, 3], [fieldBaz, 2]));
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 6]));
	});

	it("can rebase over delete", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		const deleteMark = {
			type: Delta.MarkType.Delete,
			count: 1,
		};

		applyDelta(makeDelta(deleteMark, makePath([fieldFoo, 4])), anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 4]));
		checkEquality(anchors.locate(anchor2), path2);
		assert.equal(anchors.locate(anchor3), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over delete of parent node", () => {
		const [anchors, anchor1, anchor2, anchor3, anchor4] = setup();
		const deleteMark = {
			type: Delta.MarkType.Delete,
			count: 1,
		};

		applyDelta(makeDelta(deleteMark, makePath([fieldFoo, 5])), anchors);
		assert.equal(anchors.locate(anchor4), undefined);
		assert.equal(anchors.locate(anchor1), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor4));
		assert.doesNotThrow(() => anchors.forget(anchor1));
		checkEquality(anchors.locate(anchor2), path2);
		checkEquality(anchors.locate(anchor3), path3);
		assert.throws(() => anchors.locate(anchor4));
		assert.throws(() => anchors.locate(anchor1));

		checkEquality(anchors.locate(anchor2), path2);
		applyDelta(makeDelta(deleteMark, makePath([fieldFoo, 3])), anchors);
		checkEquality(anchors.locate(anchor2), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor2));
		assert.throws(() => anchors.locate(anchor2));

		// The index of anchor3 has changed from 4 to 3 because of the deletion of the node at index 3.
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
		applyDelta(makeDelta(deleteMark, makePath([fieldFoo, 3])), anchors);
		checkEquality(anchors.locate(anchor3), undefined);
		assert.doesNotThrow(() => anchors.forget(anchor3));
		assert.throws(() => anchors.locate(anchor3));
	});

	it("can rebase over move", () => {
		const [anchors, anchor1, anchor2, anchor3] = setup();
		const moveOut: Delta.MoveOut = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			moveId: brand(1),
		};

		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			moveId: brand(1),
		};

		const modify = {
			type: Delta.MarkType.Modify,
			fields: new Map([[fieldBar, [3, moveIn]]]),
		};

		const delta = new Map([[fieldFoo, [3, moveOut, 1, modify]]]);
		applyDelta(delta, anchors);
		checkEquality(anchors.locate(anchor1), makePath([fieldFoo, 4], [fieldBar, 5]));
		checkEquality(
			anchors.locate(anchor2),
			makePath([fieldFoo, 4], [fieldBar, 3], [fieldBaz, 2]),
		);
		checkEquality(anchors.locate(anchor3), makePath([fieldFoo, 3]));
	});

	describe("internalize path", () => {
		it("identity case", () => {
			const anchors = new AnchorSet();
			const path = makePath([fieldFoo, 1]);
			const pathLonger = makePath([fieldFoo, 1], [fieldBar, 5]);
			assert.equal(anchors.internalizePath(path), path);
			assert.equal(anchors.internalizePath(pathLonger), pathLonger);

			// Check that anchor nodes are not used if they are not relevant.
			const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
			assert.equal(anchors.internalizePath(path), path);
			assert.equal(anchors.internalizePath(pathLonger), pathLonger);
		});

		it("does not reuse external PathNodes", () => {
			const anchors = new AnchorSet();
			const anchors2 = new AnchorSet();
			const anchor0 = anchors2.track(makePath([rootFieldKey, 0]));
			const path = anchors2.locate(anchor0) ?? assert.fail();
			const pathLonger: UpPath = {
				parent: path,
				parentField: fieldBar,
				parentIndex: 0,
			};

			const internalPath = anchors.internalizePath(path);
			const internalPathLonger = anchors.internalizePath(pathLonger);
			assert.notEqual(internalPath, path);
			assert.notEqual(internalPathLonger, pathLonger);
			assert.notEqual(internalPathLonger.parent, pathLonger.parent);
			expectEqualPaths(internalPath, path);
			expectEqualPaths(internalPathLonger, pathLonger);
		});

		it("use PathNodes", () => {
			const anchors = new AnchorSet();
			const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
			const path = anchors.locate(anchor0) ?? assert.fail();
			const pathLonger: UpPath = {
				parent: path,
				parentField: fieldBar,
				parentIndex: 0,
			};

			const internalPath = anchors.internalizePath(path);
			const internalPathLonger = anchors.internalizePath(pathLonger);
			assert.equal(internalPath, path);
			assert.equal(internalPathLonger, pathLonger);

			const clonedPath = clonePath(path);
			const clonedPathLonger = clonePath(pathLonger);

			const internalClonedPath = anchors.internalizePath(clonedPath);
			const internalClonedPathLonger = anchors.internalizePath(clonedPathLonger);
			expectEqualPaths(internalClonedPath, path);
			expectEqualPaths(internalClonedPathLonger, pathLonger);
			assert.equal(internalClonedPath, internalPath);
			assert.equal(internalClonedPathLonger.parent, internalClonedPath);
		});
	});

	it("triggers events", () => {
		// AnchorSet does not guarantee event ordering within a batch so use UnorderedTestLogger.
		const log = new UnorderedTestLogger();
		const anchors = new AnchorSet();
		anchors.on("childrenChanging", log.logger("root childrenChange"));
		anchors.on("treeChanging", log.logger("root treeChange"));

		const deleteMark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 1,
		};

		log.expect([]);
		applyDelta(new Map([[rootFieldKey, [0, deleteMark]]]), anchors);

		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
		log.clear();

		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();

		node0.on("childrenChanging", log.logger("childrenChange"));
		node0.on("subtreeChanging", log.logger("subtreeChange"));
		node0.on("afterDelete", log.logger("afterDelete"));

		log.expect([]);

		const insertMark: Delta.Insert = {
			type: Delta.MarkType.Insert,
			content: [singleTextCursor({ type: jsonString.name, value: "x" })],
		};
		applyDelta(new Map([[rootFieldKey, [deleteMark, insertMark]]]), anchors);

		log.expect([
			["afterDelete", 1],
			["root childrenChange", 2],
			["root treeChange", 1],
		]);
		log.clear();

		applyDelta(makeDelta(insertMark, makePath([rootFieldKey, 0], [fieldFoo, 5])), anchors);

		log.expect([["root treeChange", 1]]);
		log.clear();

		applyDelta(new Map([[rootFieldKey, [0, deleteMark]]]), anchors);
		log.expect([
			["root childrenChange", 1],
			["root treeChange", 1],
		]);
	});

	it("triggers path visitor callbacks", () => {
		const insertMark = {
			type: Delta.MarkType.Insert,
			content: [node].map(singleTextCursor),
		};
		const deleteMark: Delta.Delete = {
			type: Delta.MarkType.Delete,
			count: 1,
		};
		const log = new UnorderedTestLogger();
		const anchors = new AnchorSet();
		applyDelta(makeDelta(insertMark, makePath([rootFieldKey, 0], [fieldFoo, 3])), anchors);
		const anchor0 = anchors.track(makePath([rootFieldKey, 0]));
		const node0 = anchors.locate(anchor0) ?? assert.fail();
		const pathVisitor: PathVisitor = {
			onDelete(path: UpPath, count: number): void {
				log.logger(
					`visitSubtreeChange.onDelete-${String(path.parentField)}-${
						path.parentIndex
					}-${count}`,
				)();
			},
			onInsert(path: UpPath, content: Delta.ProtoNodes): void {
				log.logger(
					`visitSubtreeChange.onInsert-${String(path.parentField)}-${path.parentIndex}`,
				)();
			},
		};
		const unsubscribePathVisitor = node0.on("subtreeChanging", (n: AnchorNode) => pathVisitor);
		applyDelta(makeDelta(insertMark, makePath([rootFieldKey, 0], [fieldFoo, 4])), anchors);
		log.expect([["visitSubtreeChange.onInsert-foo-4", 1]]);
		log.clear();
		applyDelta(makeDelta(deleteMark, makePath([rootFieldKey, 0], [fieldFoo, 5])), anchors);
		log.expect([["visitSubtreeChange.onDelete-foo-5-1", 1]]);
		log.clear();
		unsubscribePathVisitor();
		applyDelta(makeDelta(insertMark, makePath([rootFieldKey, 0], [fieldFoo, 4])), anchors);
		log.expect([]);
	});
});

class UnorderedTestLogger {
	public readonly logEntries: Map<string, number> = new Map();
	public logger(name: string): () => void {
		return () => {
			this.logEntries.set(name, (this.logEntries.get(name) ?? 0) + 1);
		};
	}
	public expect(expected: [string, number][]) {
		const expectedMap = new Map(expected);
		assert.deepEqual(this.logEntries, expectedMap);
	}
	public clear(): void {
		this.logEntries.clear();
	}
}

function setup(): [AnchorSet, Anchor, Anchor, Anchor, Anchor] {
	const anchors = new AnchorSet();
	const anchor1 = anchors.track(path1);
	const anchor2 = anchors.track(path2);
	const anchor3 = anchors.track(path3);
	const anchor4 = anchors.track(path4);
	return [anchors, anchor1, anchor2, anchor3, anchor4];
}

type PathStep = [FieldKey, number];

function makePath(...steps: [PathStep, ...PathStep[]]): UpPath {
	assert(steps.length > 0, "Path cannot be empty");
	return steps.reduce(
		(path: UpPath | undefined, step: PathStep) => ({
			parent: path,
			parentField: step[0],
			parentIndex: step[1],
		}),
		undefined,
	) as UpPath;
}

function checkEquality(actual: UpPath | undefined, expected: UpPath | undefined) {
	assert.deepEqual(clonePath(actual), clonePath(expected));
}

function makeDelta(mark: Delta.Mark, path: UpPath): Delta.Root {
	const fields: Delta.Root = new Map([[path.parentField, [path.parentIndex, mark]]]);
	if (path.parent === undefined) {
		return fields;
	}

	const modify = {
		type: Delta.MarkType.Modify,
		fields,
	};
	return makeDelta(modify, path.parent);
}
