/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils/internal";

import { FluidClientVersion, type FormatVersion } from "../../codec/index.js";
import {
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	KeyEncodingOptions,
	getSimpleSchema,
	generateSchemaFromSimpleSchema,
	toInitialSchema,
	type UnsafeUnknownSchema,
	type ImplicitAllowedTypes,
	type ImplicitFieldSchema,
	type TreeFieldFromImplicitField,
	type TreeRootFromImplicitField,
	type TreeView,
} from "../../simple-tree/index.js";
import {
	Tree,
	TreeAlpha,
	TreeBeta,
	minimize,
	SchematizingSimpleTreeView,
	exportSimpleSchema,
} from "../../shared-tree/index.js";
import { configuredSharedTreeInternal } from "../../treeFactory.js";
import {
	MessageFormatVersion,
	EditManagerFormatVersion,
	messageCodecName,
	editManagerCodecName,
} from "../../shared-tree-core/index.js";
import {
	TestTreeProviderLite,
	TestTreeProvider,
	SummarizeType,
	createTestUndoRedoStacks,
} from "../utils.js";
import { ajvValidator } from "../codec/index.js";

const sf = new SchemaFactoryAlpha("native-counter-integration");
class Item extends sf.objectAlpha("Item", {
	count: sf.counter(sf.number, { key: "stored-count" }),
	defaulted: sf.withDefault(sf.counter(sf.number), 0),
	label: sf.withDefault(sf.required(sf.string), ""),
}) {}
class Items extends sf.array("Items", Item) {}
const options = {
	writeVersionOverrides: new Map<string, FormatVersion>([
		[messageCodecName, MessageFormatVersion.counter],
		[editManagerCodecName, EditManagerFormatVersion.counter],
	]),
	allowPossiblyIncompatibleWriteVersionOverrides: true,
};
const factory = configuredSharedTreeInternal(options).getFactory();
const config = new TreeViewConfiguration({ schema: Items });

/**
 * Creates two synchronized clients and retains an accessor from before the first client's node was hydrated.
 */
function setup() {
	const provider = new TestTreeProviderLite(2, factory);
	const left = provider.trees[0].viewWith(config);
	assert(left instanceof SchematizingSimpleTreeView);
	const item = new Item({ count: 200 });
	const retained = item.count;
	left.initialize(new Items([item]));
	provider.synchronizeMessages();
	const right = provider.trees[1].viewWith(config);
	return { provider, left, right, item, retained };
}

describe("native counter integration", () => {
	it("preserves generic noncounter object reads and assignments", () => {
		function genericAllowed<S extends ImplicitAllowedTypes>(props: S): void {
			class Column extends sf.object("GenericColumn", { props, id: sf.identifier }) {}
			function check(out: Column, value: TreeFieldFromImplicitField<S>): void {
				const read: TreeFieldFromImplicitField<S> = out.props;
				out.props = value;
				out.id = "new-id";
				assert.equal(out.props, value);
				assert.equal(typeof read, "number");
			}
			assert.equal(typeof check, "function");
		}
		genericAllowed(sf.number);
	});

	it("preserves generic root readers across content and field-read types", () => {
		function readAllowed<TSchema extends ImplicitAllowedTypes>(
			view: TreeView<TSchema>,
		): TreeFieldFromImplicitField<TSchema> {
			return view.root;
		}
		function readField<TSchema extends ImplicitFieldSchema>(
			view: TreeView<TSchema>,
		): TreeFieldFromImplicitField<TSchema> {
			return view.root;
		}
		function readRoot<TSchema extends ImplicitFieldSchema>(
			view: TreeView<TSchema>,
		): TreeRootFromImplicitField<TSchema> {
			return view.root;
		}

		const { left, right } = setup();
		try {
			assert.equal(readAllowed(left), left.root);
			assert.equal(readField(left), left.root);
			assert.equal(readRoot(left), left.root);
		} finally {
			left.dispose();
			right.dispose();
		}
	});

	it("supports recursive object schemas and unhydrated events", () => {
		class Recursive extends sf.objectRecursive("Recursive", {
			count: sf.counter(sf.number),
			child: sf.optionalRecursive([() => Recursive]),
		}) {}
		const node = new Recursive({ count: 2 });
		let changes = 0;
		const off = Tree.on(node, "nodeChanged", () => changes++);
		assert.equal(node.count.add(3), 5);
		assert.equal(changes, 1);
		off();
	});
	it("requires numeric initialization and exposes readonly values", () => {
		const item = new Item({ count: 2 });
		assert.equal(item.count.value, 2);
		assert.equal(item.defaulted.value, 0);
		// eslint-disable-next-line no-constant-condition -- Compile negative assignments without executing them.
		if (false) {
			// @ts-expect-error Counter values are readonly.
			item.count.value = 1;
			// @ts-expect-error Counter properties expose accessors, not numbers.
			item.count = 1;
			// @ts-expect-error A counter without a default requires numeric initialization.
			new Item({});
			// @ts-expect-error Only the numeric leaf is allowed.
			sf.counter(sf.string);
			// @ts-expect-error A live accessor is not persisted content.
			TreeBeta.clone(item.count);
		}
		assert.throws(() => Reflect.set(item, "count", 5), /cannot be assigned/);
		assert.throws(
			() => Reflect.apply(TreeBeta.clone, undefined, [item.count]),
			/raw tree content/,
		);
		assert.throws(() => {
			item.count = item.defaulted;
		}, /cannot be assigned/);
		assert.throws(() => Object.defineProperty(item, "count", { value: 5 }), /redefined/);
		assert.throws(() => Reflect.deleteProperty(item, "count"), /cannot be assigned/);
		assert.equal(Reflect.set(item.count, "value", 5), false);
		assert.equal(Object.getOwnPropertyDescriptor(item, "count")?.value, item.count);
		assert.equal(item.count.add(3), 5);
		assert.throws(() => item.count.add(Number.NaN), /finite/);
		assert.throws(() => Reflect.apply(sf.counter, undefined, [sf.string]), /requires exactly/);
	});

	it("retains accessors through hydration and concurrent edits", () => {
		const { provider, left, right, retained, item } = setup();
		assert.equal(retained, left.root[0].count);
		assert.equal(retained.add(3), 203);
		assert.equal(right.root[0].count.add(5), 205);
		provider.synchronizeMessages();
		assert.equal(retained.value, 208);
		assert.equal(right.root[0].count.value, 208);
		assert.throws(() => {
			item.count = right.root[0].count;
		}, /cannot be assigned/);
		assert.throws(() => Reflect.set(item, "count", 1), /cannot be assigned/);
		left.dispose();
		assert.throws(() => retained.add(1), /deleted|disposed/);
	});

	it("undoes and redoes only the local contribution after remote edits", () => {
		const { provider, left, right, retained } = setup();
		const undo = createTestUndoRedoStacks(left.events);
		retained.add(3);
		right.root[0].count.add(5);
		provider.synchronizeMessages();
		assert.equal(retained.value, 208);
		assert.equal(undo.undoStack.length, 1);
		undo.undoStack.pop()?.revert();
		provider.synchronizeMessages();
		assert.equal(retained.value, 205);
		assert.equal(right.root[0].count.value, 205);
		undo.redoStack.pop()?.revert();
		provider.synchronizeMessages();
		assert.equal(retained.value, 208);
		assert.equal(right.root[0].count.value, 208);
		undo.unsubscribe();
	});

	it("rolls back and minimizes transactions without losing additions", () => {
		const { provider, left, right, retained } = setup();
		left.runTransaction(() => {
			retained.add(8);
			retained.add(-2);
			return { rollback: true };
		});
		assert.equal(retained.value, 200);
		const undo = createTestUndoRedoStacks(left.events);
		left.runTransaction(
			() => {
				retained.add(8);
				retained.add(-2);
				left.root[0].label = "edited";
			},
			{ postProcessor: minimize },
		);
		right.root[0].count.add(4);
		provider.synchronizeMessages();
		assert.equal(retained.value, 210);
		assert.equal(right.root[0].count.value, 210);
		assert.equal(right.root[0].label, "edited");
		undo.undoStack.pop()?.revert();
		provider.synchronizeMessages();
		assert.equal(retained.value, 204);
		assert.equal(right.root[0].label, "");
		undo.redoStack.pop()?.revert();
		provider.synchronizeMessages();
		assert.equal(retained.value, 210);
		undo.unsubscribe();
	});

	it("minimizes insertion followed by edits and removal", () => {
		const { provider, left, right } = setup();
		left.runTransaction(
			() => {
				left.root.push(new Item({ count: 1 }));
				left.root[1].count.add(2);
				left.root.push(new Item({ count: 9 }));
				left.root[2].count.add(4);
				left.root.removeAt(2);
			},
			{ postProcessor: minimize },
		);
		provider.synchronizeMessages();
		assert.deepEqual(
			Array.from(left.root, (x) => x.count.value),
			[200, 3],
		);
		assert.deepEqual(
			Array.from(right.root, (x) => x.count.value),
			[200, 3],
		);
	});

	for (const scenario of ["existing-to-built", "built-to-existing"] as const) {
		it(`preserves minimized counter edits across ${scenario} parent moves and undo/redo`, () => {
			class Box extends sf.object("Box", { items: Items }) {}
			class Boxes extends sf.array("Boxes", Box) {}
			const provider = new TestTreeProviderLite(2, factory);
			const boxesConfig = new TreeViewConfiguration({ schema: Boxes });
			const left = provider.trees[0].viewWith(boxesConfig);
			assert(left instanceof SchematizingSimpleTreeView);
			left.initialize(new Boxes([new Box({ items: [new Item({ count: 200 })] })]));
			provider.synchronizeMessages();
			const right = provider.trees[1].viewWith(boxesConfig);
			const undo = createTestUndoRedoStacks(left.events);

			function assertBoth(expected: number[][]): void {
				for (const view of [left, right]) {
					assert.deepEqual(
						Array.from(view.root, (box) => Array.from(box.items, (item) => item.count.value)),
						expected,
					);
				}
			}

			try {
				left.runTransaction(
					() => {
						if (scenario === "existing-to-built") {
							left.root.push(new Box({ items: [] }));
							left.root[0].items[0].count.add(3);
							left.root[1].items.moveToEnd(0, left.root[0].items);
						} else {
							left.root.push(new Box({ items: [new Item({ count: 1 })] }));
							left.root[1].items[0].count.add(2);
							left.root[0].items.moveToEnd(0, left.root[1].items);
							left.root.removeAt(1);
						}
					},
					{ postProcessor: minimize },
				);
				provider.synchronizeMessages();
				const expected = scenario === "existing-to-built" ? [[], [203]] : [[200, 3]];
				assertBoth(expected);

				assert.equal(undo.undoStack.length, 1);
				const undoEdit = undo.undoStack.pop();
				assert(undoEdit !== undefined);
				undoEdit.revert();
				provider.synchronizeMessages();
				assertBoth([[200]]);

				assert.equal(undo.redoStack.length, 1);
				const redoEdit = undo.redoStack.pop();
				assert(redoEdit !== undefined);
				redoEdit.revert();
				provider.synchronizeMessages();
				assertBoth(expected);
			} finally {
				undo.unsubscribe();
				left.dispose();
				right.dispose();
			}
		});
	}

	it("emits field changes and follows parent movement, removal, and restoration", () => {
		const { provider, left, right, item, retained } = setup();
		const undo = createTestUndoRedoStacks(left.events);
		const changes: string[][] = [];
		const off = Tree.on(item, "nodeChanged", ({ changedProperties }) =>
			changes.push([...changedProperties]),
		);
		retained.add(1);
		assert.deepEqual(changes, [["count"]]);
		left.root.push(new Item({ count: 9 }));
		left.root.moveToEnd(0);
		assert.equal(retained, left.root[1].count);
		provider.synchronizeMessages();
		assert.equal(right.root[1].count.value, 201);
		left.root.removeAt(1);
		provider.synchronizeMessages();
		assert.equal(retained.value, 201);
		assert.throws(() => retained.add(1));
		undo.undoStack.pop()?.revert();
		provider.synchronizeMessages();
		assert.equal(retained, left.root[1].count);
		assert.equal(retained.add(2), 203);
		provider.synchronizeMessages();
		assert.equal(right.root[1].count.value, 203);
		off();
		undo.unsubscribe();
	});

	it("clones and exports raw numeric content, including stored keys", () => {
		const item = new Item({ count: 12 });
		item.count.add(3);
		const clone = TreeBeta.clone<typeof Item>(item);
		assert.notEqual(clone.count, item.count);
		assert.equal(clone.count.add(1), 16);
		assert.equal(item.count.value, 15);
		assert.deepEqual(TreeBeta.exportConcise(item), { count: 15, defaulted: 0, label: "" });
		assert.deepEqual(
			TreeBeta.exportConcise(item, { keys: KeyEncodingOptions.allStoredKeys }),
			{ "stored-count": 15, defaulted: 0, label: "" },
		);
		assert.doesNotThrow(() => TreeAlpha.exportVerbose(item));
		assert.equal(TreeAlpha.child(item, "count"), 15);
		assert.equal(new Map(TreeAlpha.children(item)).get("count"), 15);
	});

	it("round-trips numeric content through concise, verbose, and compressed formats", () => {
		const item = new Item({ count: 12 });
		item.count.add(3);
		const imported = [
			TreeBeta.importConcise(Item, TreeBeta.exportConcise(item)),
			TreeAlpha.importVerbose(Item, TreeAlpha.exportVerbose(item)),
			TreeAlpha.importCompressed(
				Item,
				TreeAlpha.exportCompressed(item, { minVersionForCollab: FluidClientVersion.v2_0 }),
				{ ...options, jsonValidator: ajvValidator },
			),
		];
		for (const node of imported) {
			assert.notEqual(node.count, item.count);
			assert.equal(node.count.value, 15);
			assert.equal(node.count.add(2), 17);
			assert.equal(item.count.value, 15);
		}
	});

	it("reconstructs view and stored schemas without losing counter semantics", () => {
		const expected = toInitialSchema(Item);
		for (const simple of [getSimpleSchema(Item), exportSimpleSchema(expected)]) {
			const generated = generateSchemaFromSimpleSchema(simple);
			assert.deepEqual(toInitialSchema(generated.root), expected);
			const node = TreeAlpha.create<UnsafeUnknownSchema>(generated.root, {
				"stored-count": 7,
				count: 7,
				defaulted: 0,
				label: "",
			});
			assert.deepEqual(
				TreeBeta.exportConcise(node, { keys: KeyEncodingOptions.allStoredKeys }),
				{ "stored-count": 7, defaulted: 0, label: "" },
			);
		}
	});

	it("summarizes, reloads, and accepts subsequent edits", async () => {
		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand, factory);
		const tree = provider.trees[0];
		const view = tree.viewWith(config);
		view.initialize(new Items([new Item({ count: 7 })]));
		view.root[0].count.add(5);
		await provider.ensureSynchronized();
		await provider.summarize();
		const reloaded = await provider.createTree();
		const loadedView = reloaded.viewWith(config);
		assert.equal(loadedView.root[0].count.value, 12);
		assert.equal(loadedView.root[0].count.add(8), 20);
		view.root[0].count.add(3);
		await provider.ensureSynchronized();
		assert.equal(loadedView.root[0].count.value, 23);
		assert.equal(view.root[0].count.value, 23);
		assert.doesNotThrow(() => TreeBeta.clone<typeof Item>(loadedView.root[0]));
		for (const container of provider.containers) {
			container.close();
		}
	});

	it("rejects root counters and old-format initialization explicitly", () => {
		assert.throws(() => new TreeViewConfiguration({ schema: sf.counter(sf.number) }), /root/);
		const provider = new TestTreeProviderLite();
		const view = provider.trees[0].viewWith(config);
		assert.throws(() => view.initialize(new Items([new Item({ count: 1 })])), /experimental/);
	});

	it("rejects loading a counter summary without both experimental format overrides", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const tree = factory.create(runtime, "counter-format-gate");
		const view = tree.viewWith(config);
		view.initialize(new Items([new Item({ count: 1 })]));
		const { summary } = await tree.summarize(true);
		const stableFactory = configuredSharedTreeInternal({}).getFactory();
		await assert.rejects(
			stableFactory.load(
				new MockFluidDataStoreRuntime(),
				"counter-format-gate",
				MockSharedObjectServices.createFromSummary(summary),
				stableFactory.attributes,
			),
			/experimental message and history/,
		);
	});
});
