/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import {
	FieldKey,
	rootFieldKey,
	UpPath,
	AnchorEvents,
	AnchorNode,
	IEditableForest,
	PathVisitor,
	ProtoNodes,
} from "../../../core";
import { brand } from "../../../util";
import { getField, jsonableTreeFromCursor, on, singleTextCursor } from "../../../feature-libraries";
import { IEmitter } from "../../../events";
import {
	fullSchemaData,
	personData,
	getReadonlyEditableTreeContext,
	setupForest,
	addressSchema,
	int32Schema,
} from "./mockData";

const fieldAddress: FieldKey = brand("address");

describe("editable-tree: event subscription", () => {
	it("consumes children changing events with correct args", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("changing", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		emitter.emit("childrenChanging", node);
		unsubscribeChanging();
		emitter.emit("childrenChanging", node);
		assert.deepEqual(log, [node]);
	});

	it("consumes subtree changing events returning void, ie. no path visitor", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("subtreeChanging", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		emitter.emit("subtreeChanging", node);
		unsubscribeChanging();
		emitter.emit("subtreeChanging", node);
		assert.deepEqual(log, [node]);
	});

	it("consumes subtree changing events returning path visitor", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const visitLog: UpPath[] = [];
		const { emitter, node } = accessEmitters(forest, [rootFieldKey, 0], [fieldAddress, 0]);
		const unsubscribeChanging = address[on]("subtreeChanging", (upPath: UpPath) => {
			log.push(upPath);
			const visitor: PathVisitor = {
				onDelete(path: UpPath, count: number): void {
					assert.equal(count, 11);
					assert.deepEqual(path, node);
					visitLog.push(path);
				},
				onInsert(path: UpPath, content: ProtoNodes): void {
					const jsonable = content.map(jsonableTreeFromCursor);
					assert.deepEqual(jsonable, [
						{
							type: addressSchema.name,
							fields: {
								zip: [
									{
										type: int32Schema.name,
										value: 33428,
									},
								],
							},
						},
					]);
					assert.deepEqual(path, node);
					visitLog.push(path);
				},
			};
			return visitor;
		});
		const results: (void | PathVisitor)[] = emitter.emitAndCollect("subtreeChanging", node);
		const visitors = results.filter((v): v is PathVisitor => v !== undefined);
		const insertContent = [
			singleTextCursor({
				type: addressSchema.name,
				fields: {
					zip: [
						{
							type: int32Schema.name,
							value: 33428,
						},
					],
				},
			}),
		];
		visitors.forEach((visitor) => {
			visitor.onDelete(node, 11);
			visitor.onInsert(node, insertContent);
		});
		unsubscribeChanging();
		emitter.emit("subtreeChanging", node);
		assert.deepEqual(log, [node]);
		assert.deepEqual(visitLog, [node, node]);
	});
});

interface PathNode extends AnchorNode {
	events: IEmitter<AnchorEvents>;
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

function accessEmitters(forest: IEditableForest, ...steps: [PathStep, ...PathStep[]]) {
	const upPath = makePath(...steps);
	const anchor = forest.anchors.track(upPath);
	const node = forest.anchors.locate(anchor) ?? assert.fail();
	const pathNode = node as PathNode;
	const emitter: IEmitter<AnchorEvents> = pathNode.events;
	return { emitter, node };
}

function retrieveAddressNode() {
	const forest = setupForest(fullSchemaData, personData);
	const context = getReadonlyEditableTreeContext(forest, fullSchemaData);
	const root = context.root.getNode(0);
	const address = root[getField](fieldAddress).getNode(0);
	return { address, forest };
}
