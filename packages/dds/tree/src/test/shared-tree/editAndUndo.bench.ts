/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDurationBatchless, benchmarkIt } from "@fluid-tools/benchmark";

import { Tree, independentView } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";
import { makeArray } from "../../util/index.js";
import { configureBenchmarkHooks, createTestUndoRedoStacks } from "../utils.js";

const schemaFactory = new SchemaFactory("editAndUndoBenchmark");
class Position extends schemaFactory.object("Position", {
	x: schemaFactory.number,
	y: schemaFactory.number,
}) {}
class Fill extends schemaFactory.object("Fill", { color: schemaFactory.string }) {}
class Item extends schemaFactory.object("Item", { position: Position, fill: Fill }) {}
class Page extends schemaFactory.object("Page", { items: schemaFactory.array(Item) }) {}
class Document extends schemaFactory.object("Document", {
	pages: schemaFactory.array(Page),
}) {}
const config = new TreeViewConfiguration({ schema: Document });

const pageCount = 10;
const itemsPerPage = 10;

function makeView(): TreeViewAlpha<typeof Document> {
	const view = independentView(config);
	view.initialize(
		new Document({
			pages: makeArray(
				pageCount,
				() =>
					new Page({
						items: makeArray(
							itemsPerPage,
							(index) =>
								new Item({
									position: new Position({ x: index, y: index }),
									fill: new Fill({ color: "red" }),
								}),
						),
					}),
			),
		}),
	);
	return view;
}

function items(view: TreeViewAlpha<typeof Document>): Item[] {
	return view.root.pages.flatMap((page) => [...page.items]);
}

/**
 * The edits benchmarked: each changes every item, in one transaction.
 */
const edits: { name: string; edit: (all: Item[], step: number) => void }[] = [
	{
		name: "move (set x and y)",
		edit: (all, step) => {
			for (const item of all) {
				item.position.x += step;
				item.position.y += step;
			}
		},
	},
	{
		name: "fill (replace an object)",
		edit: (all, step) => {
			for (const item of all) {
				item.fill = new Fill({ color: `color ${step}` });
			}
		},
	},
];

describe("Edit and undo benchmarks", () => {
	configureBenchmarkHooks();

	const itemCount = pageCount * itemsPerPage;

	for (const { name, edit } of edits) {
		benchmarkIt({
			title: `${name} of ${itemCount} nodes in a transaction`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					let step = 0;
					do {
						const view = makeView();
						const all = items(view);
						step++;
						running = state.time(() => {
							Tree.runTransaction(view, () => edit(all, step));
						});
						view.dispose();
					} while (running);
				},
			}),
		});

		benchmarkIt({
			title: `undo ${name} of ${itemCount} nodes in a transaction`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					do {
						const view = makeView();
						const all = items(view);
						const { undoStack, unsubscribe } = createTestUndoRedoStacks(view.events);
						Tree.runTransaction(view, () => edit(all, 1));
						const revertible = undoStack.pop();
						assert(revertible !== undefined);
						running = state.time(() => {
							revertible.revert();
						});
						assert.equal(all[0]?.position.x, 0);
						unsubscribe();
						view.dispose();
					} while (running);
				},
			}),
		});
	}
});
