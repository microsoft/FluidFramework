/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDurationBatchless, benchmarkIt } from "@fluid-tools/benchmark";

import { independentView } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	type TreeView,
	TreeViewConfiguration,
} from "../../simple-tree/index.js";
import { configureBenchmarkHooks } from "../utils.js";

const schemaFactory = new SchemaFactory("readAfterEditBenchmark");
class Point extends schemaFactory.object("Point", {
	x: schemaFactory.number,
	y: schemaFactory.number,
}) {}
class Item extends schemaFactory.object("Item", {
	id: schemaFactory.string,
	position: Point,
	size: Point,
	color: schemaFactory.string,
	label: schemaFactory.string,
	angle: schemaFactory.number,
	tags: schemaFactory.array(schemaFactory.string),
}) {}
class Group extends schemaFactory.object("Group", {
	name: schemaFactory.string,
	items: schemaFactory.array(Item),
}) {}
class Root extends schemaFactory.object("Root", { groups: schemaFactory.array(Group) }) {}
const config = new TreeViewConfiguration({ schema: Root });

const groupCount = 14;
const itemsPerGroup = 20;

function createView(): TreeView<typeof Root> {
	const view = independentView(config);
	view.initialize({
		groups: Array.from({ length: groupCount }, (_, group) => ({
			name: `group ${group}`,
			items: Array.from({ length: itemsPerGroup }, (__, item) => ({
				id: `${group}-${item}`,
				position: { x: item, y: group },
				size: { x: 10, y: 10 },
				color: "red",
				label: "label",
				angle: 0,
				tags: ["a", "b"],
			})),
		})),
	});
	return view;
}

/**
 * Reads every property of every item, returning a value derived from them all.
 */
function readAll(root: Root): number {
	let total = 0;
	for (const group of root.groups) {
		total += group.name.length;
		for (const item of group.items) {
			total +=
				item.id.length +
				item.position.x +
				item.position.y +
				item.size.x +
				item.size.y +
				item.color.length +
				item.label.length +
				item.angle +
				item.tags.length;
		}
	}
	return total;
}

describe("Read after edit benchmarks", () => {
	configureBenchmarkHooks();

	const itemCount = groupCount * itemsPerGroup;

	for (const edit of [true, false]) {
		benchmarkIt({
			title: `read ${itemCount} objects ${edit ? "after" : "without"} an edit`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					const view = createView();
					const expected = readAll(view.root);
					const firstItem = view.root.groups[0]?.items[0];
					assert(firstItem !== undefined);
					let running: boolean;
					do {
						if (edit) {
							firstItem.angle = firstItem.angle === 0 ? 1 : 0;
						}
						let total = 0;
						running = state.time(() => {
							total = readAll(view.root);
						});
						assert.equal(total - firstItem.angle, expected);
					} while (running);
					view.dispose();
				},
			}),
		});
	}
});
