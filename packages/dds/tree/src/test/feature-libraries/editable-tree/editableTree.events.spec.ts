/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";

import {
	Value,
	FieldKey,
	rootFieldKeySymbol,
	UpPath,
	AnchorEvents,
	AnchorNode,
	IEditableForest,
} from "../../../core";
import { brand } from "../../../util";
import { getField, on } from "../../../feature-libraries";

import { IEmitter } from "../../../events";
import {
	fullSchemaData,
	personData,
	getReadonlyEditableTreeContext,
	setupForest,
} from "./mockData";

const fieldAddress: FieldKey = brand("address");

describe("editable-tree: event subscription", () => {
	it("consumes children changing events with correct args", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("changing", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(
			forest,
			[rootFieldKeySymbol, 0],
			[fieldAddress, 0],
		);
		emitter.emit("childrenChanging", node);
		unsubscribeChanging();
		emitter.emit("childrenChanging", node);
		assert.deepEqual(log, [node]);
	});

	it("consumes value changing events with correct args", () => {
		const { address, forest } = retrieveAddressNode();
		const log: Map<Value, UpPath> = new Map();
		const unsubscribeChanging = address[on]("changing", (upPath: UpPath, value: Value) => {
			log.set(value, upPath);
		});
		const { emitter, node } = accessEmitters(
			forest,
			[rootFieldKeySymbol, 0],
			[fieldAddress, 0],
		);
		emitter.emit("valueChanging", node, 122);
		unsubscribeChanging();
		emitter.emit("valueChanging", node, 123);
		assert.deepEqual(log, new Map([[122, node]]));
	});

	it("consumes subtree changing events with correct args", () => {
		const { address, forest } = retrieveAddressNode();
		const log: UpPath[] = [];
		const unsubscribeChanging = address[on]("subtreeChanging", (upPath: UpPath) => {
			log.push(upPath);
		});
		const { emitter, node } = accessEmitters(
			forest,
			[rootFieldKeySymbol, 0],
			[fieldAddress, 0],
		);
		emitter.emit("subtreeChanging", node);
		unsubscribeChanging();
		emitter.emit("subtreeChanging", node);
		assert.deepEqual(log, [node]);
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
	const context = getReadonlyEditableTreeContext(forest);
	const root = context.root.getNode(0);
	const address = root[getField](fieldAddress).getNode(0);
	return { address, forest };
}
