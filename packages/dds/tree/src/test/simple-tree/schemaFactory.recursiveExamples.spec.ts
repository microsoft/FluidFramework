/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { createIdCompressor } from "@fluidframework/id-compressor";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	ApplyKind,
	FieldSchema,
	ITree,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeFromSchema,
	SchemaFactoryRecursive,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	TreeNodeFromImplicitAllowedTypes,
	TreeNodeSchema,
	TreeView,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";
import {
	areSafelyAssignable,
	disposeSymbol,
	requireAssignableTo,
	requireTrue,
} from "../../util/index.js";
import { ArrayToUnion, ExtractItemType, FlexListToUnion } from "../../feature-libraries/index.js";
import {
	FieldSchemaUnsafe,
	ObjectFromSchemaRecordUnsafe,
	TreeFieldFromImplicitFieldUnsafe,
	// eslint-disable-next-line import/no-internal-modules
} from "../../simple-tree/schemaFactoryRecursive.js";
import { ListRecursive, MapRecursive, ObjectRecursive } from "./testRecursiveSchema.js";

describe("Recursive Class based end to end example", () => {
	it("test", () => {
		// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
		const schema = new SchemaFactoryRecursive("com.example");

		class Box extends schema.objectRecursive("Box", {
			/**
			 * Doc comment on a schema based field. Intellisense should work when referencing the field.
			 */
			text: schema.string,
			/**
			 * Example optional field.
			 * Works the same as before.
			 */
			child: schema.optionalRecursive([() => Box]),
		}) {}

		const config = new TreeConfiguration(Box, () => new Box({ text: "hi", child: undefined }));

		function setup(tree: ITree) {
			const view: TreeView<Box> = tree.schematize(config);

			const FieldSchemaX = schema.optionalRecursive([() => Box]);
			type TFieldSchema = readonly [() => typeof Box] & readonly (() => TreeNodeSchema)[];
			type TFieldContent = TreeFieldFromImplicitField<TFieldSchema>;
			type TFieldContentNode = TreeNodeFromImplicitAllowedTypes<TFieldSchema>;
			type TFieldContentNode2 = FlexListToUnion<TFieldSchema>;

			type TFieldContentNode3 = ArrayToUnion<TFieldSchema>;
			type TFieldContentNode4 = ArrayToUnion<[() => Box]>;

			/**
			 * Convert a Array type into the type of ReadonlySet.
			 *
			 * Same as `keyof ListToKeys<T, unknown>` but work for values that are not valid keys.
			 * @public
			 */
			type ArrayToUnion2<T extends readonly unknown[]> = T[number];

			type TFieldContentNode5 = ArrayToUnion2<TFieldSchema>;
			type TFieldContentNode6 = ArrayToUnion2<readonly [() => Box]>;

			type ExtractItemType2<Item extends () => unknown> = Item extends () => infer Result
				? Result
				: never;

			type TFieldContentNode7 = ExtractItemType<TFieldContentNode3>;
			type TFieldContentNode8 = ExtractItemType2<TFieldContentNode3>;
			type TFieldContentNode9 = ReturnType<TFieldContentNode3>;
			type X = typeof Box & TreeNodeSchema;
			type XX = ReturnType<(() => 1) & (() => number)>;
			type XY = ReturnType<(() => number) & (() => 1)>;

			type Field = Box["child"];

			const stuff: undefined | Box = view.root.child;

			view.root.child = new Box({
				text: "hi2",
				child: new Box({ text: "hi3", child: new Box({ text: "hi4", child: undefined }) }),
			});

			type _check1 = requireAssignableTo<undefined, typeof view.root.child.child>;
			type _check2 = requireAssignableTo<Box, typeof view.root.child.child>;

			const stuff2 = view.root.child?.child?.child;

			assert.equal(stuff2, "hi4");
		}

		const factory = new TreeFactory({});
		const theTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		setup(theTree);
	});

	it("test3", () => {
		// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
		const schema = new SchemaFactoryRecursive("com.example");

		class Box extends schema.objectRecursive("Box", {
			/**
			 * Doc comment on a schema based field. Intellisense should work when referencing the field.
			 */
			text: schema.string,
			/**
			 * Example optional field.
			 * Works the same as before.
			 */
			child: schema.optionalRecursive([() => Box]),
		}) {}

		const config = new TreeConfiguration(Box, () => new Box({ text: "hi", child: undefined }));

		function setup(tree: ITree) {
			const view: TreeView<Box> = tree.schematize(config);

			const FieldSchemaX = schema.optionalRecursive([() => Box]);
			type TFieldSchema = readonly [() => typeof Box] & readonly (() => TreeNodeSchema)[];
			type TFieldContent = TreeFieldFromImplicitField<TFieldSchema>;
			type TFieldContentNode = TreeNodeFromImplicitAllowedTypes<TFieldSchema>;
			type TFieldContentNode2 = FlexListToUnion<TFieldSchema>;

			type TFieldContentNode3 = ArrayToUnion<TFieldSchema>;
			type TFieldContentNode4 = ArrayToUnion<[() => Box]>;

			/**
			 * Convert a Array type into the type of ReadonlySet.
			 *
			 * Same as `keyof ListToKeys<T, unknown>` but work for values that are not valid keys.
			 * @public
			 */
			type ArrayToUnion2<T extends readonly unknown[]> = T[number];

			type TFieldContentNode5 = ArrayToUnion2<TFieldSchema>;
			type TFieldContentNode6 = ArrayToUnion2<readonly [() => Box]>;

			type ExtractItemType2<Item extends () => unknown> = Item extends () => infer Result
				? Result
				: never;

			type TFieldContentNode7 = ExtractItemType<TFieldContentNode3>;
			type TFieldContentNode8 = ExtractItemType2<TFieldContentNode3>;
			type TFieldContentNode9 = ReturnType<TFieldContentNode3>;
			type X = typeof Box & TreeNodeSchema;
			type XX = ReturnType<(() => 1) & (() => number)>;
			type XY = ReturnType<(() => number) & (() => 1)>;

			type Field = Box["child"];

			const stuff: undefined | Box = view.root.child;

			view.root.child = new Box({
				text: "hi2",
				child: new Box({ text: "hi3", child: new Box({ text: "hi4", child: undefined }) }),
			});

			type _check1 = requireAssignableTo<undefined, typeof view.root.child.child>;
			type _check2 = requireAssignableTo<Box, typeof view.root.child.child>;

			const stuff2 = view.root.child?.child?.child;

			assert.equal(stuff2, "hi4");
		}

		const factory = new TreeFactory({});
		const theTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		setup(theTree);
	});

	it("objects", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const config: TreeConfiguration<typeof ObjectRecursive> = new TreeConfiguration(
			ObjectRecursive,
			() => new ObjectRecursive({ x: undefined }),
		);
		const view: TreeView<ObjectRecursive> = tree.schematize(config);
		const data = [Reflect.ownKeys(view.root)];
		// TODO: are empty optional fields supposed to show up as keys in simple-tree?
		// assert.deepEqual(data, []);

		// Nested
		{
			type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof ObjectRecursive>;
			// const _check: T = new ObjectRecursive({ x: undefined });
			// Only explicitly constructed recursive maps are currently allowed:
			// type _check = requireTrue<areSafelyAssignable<T, ObjectRecursive>>;
			type Child = ObjectRecursive["x"];
			type _check = requireTrue<areSafelyAssignable<Child, ObjectRecursive | undefined>>;
		}

		view.root.x = new ObjectRecursive({ x: undefined });

		view.root.x = view.root.x?.x?.x?.x ?? new ObjectRecursive({ x: undefined });
	});

	it("objects2", () => {
		const sf = new SchemaFactoryRecursive("recursive");

		class ObjectRecursive2 extends sf.objectRecursive("Object", {
			x: sf.optionalRecursive([() => ObjectRecursive2]),
		}) {}

		type FieldsSchema = (typeof ObjectRecursive2)["info"];
		type XSchema = FieldsSchema["x"];
		type Fields = ObjectFromSchemaRecordUnsafe<FieldsSchema>;
		type Field = TreeFieldFromImplicitFieldUnsafe<XSchema>;
		type Field2 = XSchema extends FieldSchema<infer Kind, infer Types>
			? ApplyKind<TreeNodeFromImplicitAllowedTypes<Types>, Kind>
			: "zzz";
		type XTypes = XSchema extends FieldSchemaUnsafe<infer Kind, infer Types> ? Types : "Q";
		type Field3 = TreeNodeFromImplicitAllowedTypes<XTypes>;
		type Field4 = FlexListToUnion<XTypes>;

		type Insertable = InsertableTreeNodeFromImplicitAllowedTypes<typeof ObjectRecursive2>;
		type Constructable = NodeFromSchema<typeof ObjectRecursive2>;
		type Child = ObjectRecursive2["x"];
		type _check = requireTrue<areSafelyAssignable<Child, ObjectRecursive2 | undefined>>;
	});

	it("lists", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		// Explicit constructor call
		{
			const view: TreeView<ListRecursive> = tree.schematize(
				new TreeConfiguration(ListRecursive, () => new ListRecursive({ x: [] })),
			);
			const data = [...view.root];
			assert.deepEqual(data, []);
			view[disposeSymbol]();
		}

		// Nested
		{
			const view: TreeView<ListRecursive> = tree.schematize(
				new TreeConfiguration(
					ListRecursive,
					() => new ListRecursive({ x: [new ListRecursive({ x: [] })] }),
				),
			);
			const data = [...view.root];
			assert.deepEqual(data, []);

			type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof ListRecursive>;
			// @ts-expect-error ListRecursive should not be implicitly constructable (for now).
			const _check: T = [];
			// Only explicitly constructed recursive lists are currently allowed:
			type _check = requireTrue<areSafelyAssignable<T, ListRecursive>>;

			view.root.insertAtEnd(new ListRecursive({ x: [] }));

			view.root[0].insertAtEnd(new ListRecursive({ x: [] }));
		}
	});

	it("maps", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);

		const view: TreeView<MapRecursive> = tree.schematize(
			new TreeConfiguration(MapRecursive, () => new MapRecursive(undefined)),
		);
		const data = [...view.root];
		assert.deepEqual(data, []);

		// Nested
		{
			type T = InsertableTreeNodeFromImplicitAllowedTypes<typeof MapRecursive>;
			const _check: T = new MapRecursive(undefined);
			// Only explicitly constructed recursive maps are currently allowed:
			type _check = requireTrue<areSafelyAssignable<T, MapRecursive>>;
		}

		view.root.set("x", new MapRecursive(undefined));

		view.root.get("x")?.set("x", new MapRecursive(undefined));
	});
});
