/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-internal-modules */

import { strict as assert } from "node:assert";

import {
	compareUpPaths,
	CursorLocationType,
	type FieldKey,
	type MapTree,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	LeafNodeStoredSchema,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type TreeStoredSchema,
	ValueSchema,
	moveToDetachedField,
	rootField,
	rootFieldKey,
} from "../../../core/index.js";
import {
	assertFlexTreeEntityNotFreed,
	Context,
	FieldKinds,
	MockNodeIdentifierManager,
	defaultSchemaPolicy,
	type FlexTreeField,
	cursorForMapTreeNode,
} from "../../../feature-libraries/index.js";
import {
	LazyGeneralNode,
	LazyTreeNode,
} from "../../../feature-libraries/flex-tree/lazyNode.js";
import { AnchoredField, LazyField } from "../../../feature-libraries/flex-tree/lazyField.js";
import { withObservation } from "../../../feature-libraries/flex-tree/observer.js";
import { Context as SimpleContext } from "../../../simple-tree/core/context.js";
import {
	createField,
	UnhydratedContext,
	UnhydratedGeneralNode,
	UnhydratedSequenceField,
} from "../../../simple-tree/core/unhydratedFlexTree.js";
import {
	ForestTypeOptimized,
	ForestTypeReference,
	SharedTreeKernel,
} from "../../../shared-tree/index.js";
import { brand, disposeSymbol } from "../../../util/index.js";
import {
	checkoutWithContent,
	createTestUndoRedoStacks,
	SharedTreeTestFactory,
	TestTreeProviderLite,
} from "../../utils.js";

const rootType: TreeNodeSchemaIdentifier = brand("general-node");
const numberType: TreeNodeSchemaIdentifier = brand("general-number");
const stringType: TreeNodeSchemaIdentifier = brand("com.fluidframework.leaf.string");
const key = (name: string): FieldKey => brand(name);
const number = (value: number): MapTree => ({
	type: numberType,
	value,
	fields: new Map(),
});
const string = (value: string): MapTree => ({
	type: stringType,
	value,
	fields: new Map(),
});
const fieldSchema = (
	kind: TreeFieldStoredSchema["kind"],
	type = numberType,
): TreeFieldStoredSchema => ({
	kind,
	types: new Set([type]),
	persistedMetadata: undefined,
});
const objectSchema = new ObjectNodeStoredSchema(
	new Map([
		[key("required"), fieldSchema(FieldKinds.required.identifier)],
		[key("optional"), fieldSchema(FieldKinds.optional.identifier)],
		[key("identifier"), fieldSchema(FieldKinds.identifier.identifier, stringType)],
		[key("sequence"), fieldSchema(FieldKinds.sequence.identifier)],
	]),
);
const object: MapTree = {
	type: rootType,
	fields: new Map([
		[key("required"), [number(1)]],
		[key("identifier"), [string("id")]],
		[key("sequence"), [number(2), number(3)]],
	]),
};

function storedSchema(nodeSchema: TreeNodeStoredSchema): TreeStoredSchema {
	return {
		rootFieldSchema: fieldSchema(FieldKinds.required.identifier, rootType),
		nodeSchema: new Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema>([
			[rootType, nodeSchema],
			[numberType, new LeafNodeStoredSchema(ValueSchema.Number)],
			[stringType, new LeafNodeStoredSchema(ValueSchema.String)],
		]),
	};
}

function unhydrated(content: MapTree, schema: TreeStoredSchema): UnhydratedGeneralNode {
	const context = new SimpleContext(
		new UnhydratedContext(defaultSchemaPolicy, schema.nodeSchema),
		new Map(),
	);
	const build = (tree: MapTree): UnhydratedGeneralNode =>
		new UnhydratedGeneralNode(
			tree,
			new Map(
				[...tree.fields].map(([fieldKey, children]) => [
					fieldKey,
					createField(
						context.flexContext,
						(schema.nodeSchema.get(tree.type) ?? assert.fail()).getFieldSchema(fieldKey).kind,
						fieldKey,
						children.map(build),
					),
				]),
			),
			context,
		);
	return build(content);
}

describe("General field storage", () => {
	for (const [name, forestType] of [
		["ChunkedForest", ForestTypeOptimized],
		["ObjectForest", ForestTypeReference],
	] as const) {
		for (const kind of [FieldKinds.optional, FieldKinds.sequence]) {
			it(`borrows ${kind.identifier} map cursors without boxing children or owning resources (${name})`, () => {
				const schema = storedSchema(
					new MapNodeStoredSchema({
						...fieldSchema(kind.identifier),
						types: new Set([numberType, rootType]),
					}),
				);
				const childCount = kind === FieldKinds.optional ? 1 : 128;
				const content: MapTree = {
					type: rootType,
					fields: new Map([
						[
							key("nested"),
							[
								{
									type: rootType,
									fields: new Map([
										[key("items"), Array.from({ length: childCount }, (_, i) => number(i))],
									]),
								},
							],
						],
					]),
				};
				const checkout = checkoutWithContent(
					{ schema, initialTree: cursorForMapTreeNode(content) },
					{ forestType },
				);
				const context = new Context(
					defaultSchemaPolicy,
					checkout,
					new MockNodeIdentifierManager(),
				);
				try {
					const root = context.root;
					assert(root instanceof LazyField);
					assert(root instanceof AnchoredField);
					assertFlexTreeEntityNotFreed(root);
					const outer = root.boxedAt(0) ?? assert.fail();
					const container = outer.getBoxed(key("nested"));
					const node = container.boxedAt(0);
					assert(node instanceof LazyGeneralNode);
					const field = node.getBoxed(key("items"));
					const missing = node.getBoxed(key("missing"));
					assert(field instanceof LazyField);
					assert(missing instanceof LazyField);
					assert(!(field instanceof AnchoredField));
					assert(!(missing instanceof AnchoredField));
					assertFlexTreeEntityNotFreed(field);
					const parentCursor = node.cursor;
					const parentPath = parentCursor.getPath();
					const anchors = context.withAnchors.size;
					const cursors = context.withCursors.size;
					const cursor = field.borrowCursor();
					assert.equal(cursor.mode, CursorLocationType.Fields);
					assert.equal(cursor.getFieldKey(), key("items"));
					assert.equal(cursor.getFieldLength(), childCount);
					assert.equal(context.withAnchors.size, anchors);
					assert(cursor.firstNode());
					for (let i = 0; i < childCount; i++) {
						assert.equal(cursor.value, i);
						assert.equal(cursor.type, numberType);
						assert.equal(cursor.nextNode(), i + 1 < childCount);
					}
					assert.equal(cursor.mode, CursorLocationType.Fields);
					cursor.exitField();
					assert.equal(cursor.type, rootType);
					cursor.enterField(key("items"));
					assert.equal(missing.borrowCursor().getFieldLength(), 0);
					assert.equal(parentCursor.mode, CursorLocationType.Nodes);
					assert(compareUpPaths(parentCursor.getPath(), parentPath));
					assert.equal(context.withAnchors.size, anchors);
					assert.equal(context.withCursors.size, cursors);

					for (const entity of context.withCursors) entity.prepareForEdit();
					assert.equal(field.borrowCursor().getFieldLength(), childCount);
					assert.equal(context.withCursors.size, 0);

					if (field.is(FieldKinds.optional)) {
						field.editor.set(undefined, false);
					} else {
						assert(field.is(FieldKinds.sequence));
						field.editor.remove(0, childCount);
					}
					assert.equal(field.borrowCursor().getFieldLength(), 0);
					if (field.is(FieldKinds.optional)) {
						field.editor.set(number(7), true);
					} else {
						assert(field.is(FieldKinds.sequence));
						field.editor.insert(0, [number(7)]);
					}
					assert.equal(field.borrowCursor().getFieldLength(), 1);
					assert.equal(context.withAnchors.size, anchors);

					if (container.is(FieldKinds.optional)) {
						container.editor.set(undefined, false);
					} else {
						assert(container.is(FieldKinds.sequence));
						const destination = outer.getBoxed(key("moved"));
						assert(destination.is(FieldKinds.sequence));
						checkout.editor.move(
							container.getFieldPath(),
							0,
							1,
							destination.getFieldPath(),
							0,
						);
						assert.equal(field.borrowCursor().getFieldLength(), 1);
						destination.editor.remove(0, 1);
					}
					const removedCursor = field.borrowCursor();
					assert.equal(removedCursor.getFieldKey(), key("items"));
					removedCursor.enterNode(0);
					assert.equal(removedCursor.value, 7);
					removedCursor.exitNode();
					context.clear();
					assert.equal(root.isFreed(), true);
					assert.equal(field.isFreed(), true);
					assert.throws(() => assertFlexTreeEntityNotFreed(field));
					assert.throws(() => field.borrowCursor());
				} finally {
					context[disposeSymbol]();
					checkout.dispose();
				}
			});
		}

		it(`supports every field kind on objects without fixed specialization (${name})`, () => {
			const schema = storedSchema(objectSchema);
			const checkout = checkoutWithContent(
				{ schema, initialTree: cursorForMapTreeNode(object) },
				{ forestType },
			);
			const context = new Context(
				defaultSchemaPolicy,
				checkout,
				new MockNodeIdentifierManager(),
			);
			const cursor = checkout.forest.allocateCursor();
			moveToDetachedField(checkout.forest, cursor, rootField);
			cursor.enterNode(0);
			const anchor = cursor.buildAnchor();
			const anchorNode = checkout.forest.anchors.locate(anchor) ?? assert.fail();
			const node = new LazyGeneralNode(context, rootType, cursor, anchorNode, anchor);
			cursor.free();
			assert.equal(context.root.boxedAt(0), node);
			const resources = context.withAnchors.size;
			const required = node.getBoxed(key("required"));
			const optional = node.getBoxed(key("optional"));
			const identifier = node.getBoxed(key("identifier"));
			const sequence = node.getBoxed(key("sequence"));
			for (const field of [required, optional, identifier, sequence]) {
				assert(field instanceof LazyField);
				assert(!(field instanceof AnchoredField));
			}
			assert(required.is(FieldKinds.required));
			assert(optional.is(FieldKinds.optional));
			assert(identifier.is(FieldKinds.identifier));
			assert(sequence.is(FieldKinds.sequence));
			assert.equal(required.content, 1);
			assert.equal(identifier.content, "id");
			assert.equal(optional.content, undefined);
			assert.equal(node.fieldCache?.size, 3);
			let observations = 0;
			withObservation(
				{
					observeNodeField: (observed, observedKey) => {
						assert.equal(observed, node);
						assert.equal(observedKey, "optional");
						observations++;
					},
					observeNodeFields: () => assert.fail(),
					observeNodeDeep: () => assert.fail(),
					observeParentOf: () => assert.fail(),
				},
				() => assert.equal(node.tryGetField(key("optional")), undefined),
			);
			assert.equal(observations, 1);
			assert.deepEqual(
				sequence.map((value) => [value, node.getFieldContent(key("required"))]),
				[
					[2, 1],
					[3, 1],
				],
			);
			assert.throws(() => sequence.map(() => assert.fail("callback")), /callback/);
			assert.throws(() => sequence.atIndex(-1));
			assert.throws(() => sequence.atIndex(99));
			assert.equal(node.cursor.mode, CursorLocationType.Nodes);
			const iterator = sequence[Symbol.iterator]();
			assert.equal(iterator.next().value?.value, 2);
			assert.equal(node.cursor.mode, CursorLocationType.Nodes);
			assert.equal(node.getFieldContent(key("required")), 1);
			iterator.return?.();
			for (let i = 0; i < 10_000; i++) {
				assert.equal(node.getBoxed(key(`missing-${i}`)).length, 0);
			}
			// Only the explicitly boxed sequence child above adds a resource.
			assert.equal(context.withAnchors.size, resources + 1);
			optional.editor.set(number(4), true);
			const replacement = node.getBoxed(key("optional"));
			assert.notEqual(replacement, optional);
			assert.equal(optional.content, 4);
			optional.editor.set(undefined, false);
			assert.equal(node.fieldCache?.has(key("optional")), false);
			assert.equal(replacement.length, 0);
			required.editor.set(number(5));
			identifier.editor.set(string("new-id"));
			assert.equal(required.content, 5);
			assert.equal(identifier.content, "new-id");
			sequence.editor.remove(0, 2);
			assert.equal(node.fieldCache?.has(key("sequence")), false);
			const empty = node.getBoxed(key("sequence"));
			assert.notEqual(empty, sequence);
			sequence.editor.insert(0, [number(6), number(7)]);
			assert.equal(empty.length, 2);
			assert.equal(sequence.at(-1), 7);
			assert.equal(sequence.borrowCursor().getFieldLength(), 2);
			const forbidden = node.getBoxed(key("added"));
			context.clear();
			assert.throws(() => optional.content);
			assert.throws(() => sequence.length);
			assert.throws(() => required.editor.set(number(8)));
			checkout.updateSchema(
				storedSchema(
					new ObjectNodeStoredSchema(
						new Map([
							...objectSchema.objectNodeFields,
							[key("added"), fieldSchema(FieldKinds.optional.identifier)],
						]),
					),
				),
			);
			assert.equal(forbidden.length, 0);
			assert.throws(() => forbidden.parent);
			assert(context.root.boxedAt(0)?.getBoxed(key("added")).is(FieldKinds.optional));
			context[disposeSymbol]();
			checkout.dispose();
		});

		it(`updates retained sequence-map fields after remote edits (${name})`, () => {
			const schema = {
				...storedSchema(new MapNodeStoredSchema(fieldSchema(FieldKinds.sequence.identifier))),
				rootFieldSchema: fieldSchema(FieldKinds.optional.identifier, rootType),
			};
			const provider = new TestTreeProviderLite(
				2,
				new SharedTreeTestFactory(() => {}, undefined, { forest: forestType }),
			);
			const [sourceTree, targetTree] = provider.trees;
			assert("kernel" in sourceTree && sourceTree.kernel instanceof SharedTreeKernel);
			assert("kernel" in targetTree && targetTree.kernel instanceof SharedTreeKernel);
			const source = sourceTree.kernel.checkout;
			const target = targetTree.kernel.checkout;
			source.transaction.start();
			source.updateSchema(schema, true);
			const sourceContext = new Context(
				defaultSchemaPolicy,
				source,
				new MockNodeIdentifierManager(),
			);
			const root = sourceContext.root;
			assert(root.is(FieldKinds.optional));
			root.editor.set(
				{
					type: rootType,
					fields: new Map([[key("key"), [number(1), number(2)]]]),
				},
				true,
			);
			source.transaction.commit();
			provider.synchronizeMessages();
			const targetContext = new Context(
				defaultSchemaPolicy,
				target,
				new MockNodeIdentifierManager(),
			);
			const sourceNode = sourceContext.root.boxedAt(0) ?? assert.fail();
			const targetNode = targetContext.root.boxedAt(0);
			assert(targetNode instanceof LazyGeneralNode);
			const sourceField = sourceNode.getBoxed(key("key"));
			const targetField = targetNode.getBoxed(key("key"));
			assert(sourceField.is(FieldKinds.sequence) && targetField.is(FieldKinds.sequence));
			let notifications = 0;
			const off = targetNode.anchorNode.events.on(
				"childrenChangedAfterBatch",
				() => notifications++,
			);
			sourceField.editor.remove(0, 2);
			provider.synchronizeMessages();
			assert.equal(targetField.length, 0);
			assert.equal(targetNode.fieldCache, undefined);
			sourceField.editor.insert(0, [number(3)]);
			provider.synchronizeMessages();
			assert.equal(targetField.at(0), 3);
			assert.notEqual(targetNode.getBoxed(key("key")), targetField);
			assert.equal(notifications, 2);
			off();
			sourceContext[disposeSymbol]();
			targetContext[disposeSymbol]();
		});

		it(`bounds sequence-map churn and follows moves, merge, undo and destruction (${name})`, () => {
			const schema = storedSchema(
				new MapNodeStoredSchema(fieldSchema(FieldKinds.sequence.identifier)),
			);
			const checkout = checkoutWithContent(
				{
					schema,
					initialTree: cursorForMapTreeNode<MapTree>({
						type: rootType,
						fields: new Map([[key("source"), [number(1), number(2)]]]),
					}),
				},
				{ forestType },
			);
			const context = new Context(
				defaultSchemaPolicy,
				checkout,
				new MockNodeIdentifierManager(),
			);
			const node = context.root.boxedAt(0);
			assert(node instanceof LazyGeneralNode);
			const source = node.getBoxed(key("source"));
			const destination = node.getBoxed(key("destination"));
			assert(source.is(FieldKinds.sequence) && destination.is(FieldKinds.sequence));
			const child = source.boxedAt(0);
			assert(child instanceof LazyTreeNode);
			const resources = context.withAnchors.size;
			for (let i = 0; i < 256; i++) {
				const churnKey = key(`churn-${i}`);
				const field: FlexTreeField = node.getBoxed(churnKey);
				assert(field.is(FieldKinds.sequence));
				field.editor.insert(0, [number(i)]);
				assert.notEqual(node.getBoxed(churnKey), field);
				field.editor.remove(0, 1);
				assert.equal(field.length, 0);
				assert.equal(node.fieldCache?.has(churnKey), false);
			}
			assert.equal(context.withAnchors.size, resources);
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(checkout.events);
			checkout.editor.move(source.getFieldPath(), 0, 2, destination.getFieldPath(), 0);
			assert(!node.fieldCache?.has(key("source")));
			assert.equal(source.length, 0);
			assert.equal(destination.at(0), 1);
			assert.equal(child.parentField.parent.key, "destination");
			undoStack.pop()?.revert();
			assert.equal(source.length, 2);
			assert.equal(destination.length, 0);
			const fork = checkout.fork();
			const forkContext = new Context(
				defaultSchemaPolicy,
				fork,
				new MockNodeIdentifierManager(),
			);
			const forkNode = forkContext.root.boxedAt(0) ?? assert.fail();
			const forkSource = forkNode.getBoxed(key("source"));
			assert(forkSource.is(FieldKinds.sequence));
			forkSource.editor.remove(0, 2);
			checkout.merge(fork, false);
			assert.equal(source.length, 0);
			assert(!node.fieldCache?.has(key("source")));
			forkContext[disposeSymbol]();
			fork.dispose();
			unsubscribe();
			const visitor = checkout.forest.anchors.acquireVisitor();
			visitor.destroy(rootFieldKey, 1);
			visitor.free();
			assert(node.isFreed());
			assert.throws(() => source.length);
			context[disposeSymbol]();
			checkout.dispose();
		});
	}

	it("supports every field kind on unhydrated general objects and bounds forbidden keys", () => {
		const node = unhydrated(object, storedSchema(objectSchema));
		const required = node.getBoxed("required");
		const optional = node.getBoxed("optional");
		const identifier = node.getBoxed("identifier");
		const sequence = node.getBoxed("sequence");
		assert(required.is(FieldKinds.required));
		assert(optional.is(FieldKinds.optional));
		assert(identifier.is(FieldKinds.identifier));
		assert(sequence.is(FieldKinds.sequence));
		assert.equal(required.content, 1);
		assert.equal(identifier.content, "id");
		assert.deepEqual(
			sequence.map((value) => value),
			[2, 3],
		);
		for (let i = 0; i < 10_000; i++) {
			assert.equal(node.getBoxed(`missing-${i}`).length, 0);
		}
		assert.equal(node.allFieldsLazy.size, 3);
		const leaf = (value: number) => unhydrated(number(value), storedSchema(objectSchema));
		optional.editor.set(leaf(4), true);
		const replacement = node.getBoxed("optional");
		assert.equal(replacement, optional);
		optional.editor.set(undefined, false);
		assert.equal(replacement.length, 0);
		assert.equal(node.allFieldsLazy.size, 3);
		const current = node.getBoxed("optional");
		assert(current.is(FieldKinds.optional));
		current.editor.set(leaf(5), true);
		assert.equal(optional.content, 5);
		assert.equal(replacement.boxedAt(0)?.parentField.parent, current);
		required.editor.set(leaf(6));
		identifier.editor.set(unhydrated(string("new-id"), storedSchema(objectSchema)));
		assert.equal(required.content, 6);
		assert.equal(identifier.content, "new-id");
	});

	it("keeps retained unhydrated sequence facades canonical for edits and alias moves", () => {
		const schema = storedSchema(
			new MapNodeStoredSchema(fieldSchema(FieldKinds.sequence.identifier)),
		);
		const node = unhydrated({ type: rootType, fields: new Map() }, schema);
		const first = node.getBoxed("key");
		assert(first instanceof UnhydratedSequenceField);
		first.editor.insert(0, [unhydrated(number(1), schema), unhydrated(number(2), schema)]);
		first.editor.remove(0, 2);
		assert.equal(node.allFieldsLazy.size, 0);
		const second = node.getBoxed("key");
		assert(second instanceof UnhydratedSequenceField);
		second.editor.insert(0, [unhydrated(number(3), schema), unhydrated(number(4), schema)]);
		assert.deepEqual(
			first.map((value) => value),
			[3, 4],
		);
		let events = 0;
		const off = node.events.on("childrenChangedAfterBatch", () => events++);
		first.editor.move(0, 1, 2, second);
		assert.deepEqual(
			second.map((value) => value),
			[4, 3],
		);
		assert.equal(events, 1);
		assert.equal(first.boxedAt(0)?.parentField.parent, second);
		first.editor.remove(0, 2);
		assert.equal(node.allFieldsLazy.size, 0);
		off();
		for (let i = 0; i < 10_000; i++) {
			const field = node.getBoxed(`churn-${i}`);
			assert(field.is(FieldKinds.sequence));
			field.editor.insert(0, [unhydrated(number(i), schema)]);
			field.editor.remove(0, 1);
		}
		assert.equal(node.allFieldsLazy.size, 0);
	});

	it("retains pending defaults but evicts a general field when its default resolves empty", () => {
		const schema = storedSchema(objectSchema);
		const context = new SimpleContext(
			new UnhydratedContext(defaultSchemaPolicy, schema.nodeSchema),
			new Map(),
		);
		let calls = 0;
		const field = createField(
			context.flexContext,
			FieldKinds.optional.identifier,
			key("optional"),
			() => {
				calls++;
				return [];
			},
		);
		const node = new UnhydratedGeneralNode(
			{ type: rootType },
			new Map([[key("optional"), field]]),
			context,
		);
		assert.equal(calls, 0);
		assert.equal(node.allFieldsLazy.size, 1);
		assert.equal(node.getBoxed("optional"), field);
		assert.equal(field.length, 0);
		assert.equal(calls, 1);
		assert.equal(node.allFieldsLazy.size, 0);
		assert.notEqual(node.getBoxed("optional"), field);
	});
});
