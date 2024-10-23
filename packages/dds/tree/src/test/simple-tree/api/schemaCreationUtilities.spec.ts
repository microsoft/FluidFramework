/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	type NodeFromSchema,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
	type InsertableTreeFieldFromImplicitField,
	type TreeNodeSchema,
	type LazyItem,
	type AllowedTypes,
	type InsertableTreeNodeFromAllowedTypes,
	type InsertableTypedNode,
} from "../../../simple-tree/index.js";
import {
	adaptEnum,
	enumFromStrings,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaCreationUtilities.js";
import { TreeFactory } from "../../../treeFactory.js";
import { testIdCompressor } from "../../utils.js";
import { unsafeArrayToTuple } from "../../../util/index.js";

const schema = new SchemaFactory("test");

describe("schemaCreationUtilities", () => {
	it("enum type switch", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: Mode.schema }) {}
		const config = new TreeViewConfiguration({ schema: Parent });

		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: testIdCompressor }),
			"tree",
		);
		const view: TreeView<typeof Parent> = tree.viewWith(config);
		view.initialize(
			new Parent({
				mode: new Mode.Bonus(),
			}),
		);
		const mode = view.root.mode;
		switch (true) {
			case mode instanceof Mode.Bonus: {
				// This one runs
				break;
			}
			case mode instanceof Mode.Fun: {
				assert.fail();
			}
			case mode instanceof Mode.Cool: {
				assert.fail();
			}
			default:
				assert.fail();
		}
	});

	it("enumFromStrings example", () => {
		const schemaFactory = new SchemaFactory("x");
		const Mode = enumFromStrings(schemaFactory, ["Fun", "Cool"]);
		type Mode = NodeFromSchema<(typeof Mode.schema)[number]>;
		const nodeFromString: Mode = Mode("Fun");
		const nodeFromSchema: Mode = new Mode.Fun();
		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Check this compiles, but don't run it since node is unhydrated
			const nameFromNode: "Fun" | "Cool" = nodeFromSchema.value;
		}

		class Parent extends schemaFactory.object("Parent", { mode: Mode.schema }) {}
	});

	it("adaptEnum example from docs", () => {
		const schemaFactory = new SchemaFactory("com.myApp");
		// An enum for use in the tree. Must have string keys.
		enum Mode {
			a = "A",
			b = "B",
		}
		// Define the schema for each member of the enum using a nested scope to group them together.
		const ModeNodes = adaptEnum(new SchemaFactory(`${schemaFactory.scope}.Mode`), Mode);
		// Defined the types of the nodes which correspond to this the schema.
		type ModeNodes = NodeFromSchema<(typeof ModeNodes.schema)[number]>;
		// An example schema which has an enum as a child.
		class Parent extends schemaFactory.object("Parent", {
			// adaptEnum's return value can be use as an `AllowedTypes` array allowing any of the members of the enum.
			mode: ModeNodes.schema,
		}) {}

		// Example usage of enum based nodes, showing what type to use and that `.value` can be used to read out the enum value.
		function getValue(node: ModeNodes): Mode {
			return node.value;
		}

		// Example constructing a tree containing an enum node from an enum value.
		// The syntax `new ModeNodes.a()` is also supported.
		function setValue(node: Parent): void {
			node.mode = ModeNodes(Mode.a);
		}
	});

	it("adaptEnum example", () => {
		const schemaFactory = new SchemaFactory("x");

		enum Mode {
			a = "A",
			b = "B",
		}
		const ModeNodes = adaptEnum(schema, Mode);
		type ModeNodes = NodeFromSchema<(typeof ModeNodes.schema)[number]>;
		const nodeFromString: ModeNodes = ModeNodes(Mode.a);
		const nodeFromSchema: ModeNodes = new ModeNodes.a();
		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Check this compiles, but don't run it since node is unhydrated
			const nameFromNode: Mode = nodeFromSchema.value;
		}
		class Parent extends schemaFactory.object("Parent", {
			mode: ModeNodes.schema,
		}) {}

		const _test1: InstanceType<typeof ModeNodes.a> = new ModeNodes.a();
		// @ts-expect-error Incompatible enums types should not be assignable.
		const _test2: InstanceType<typeof ModeNodes.a> = new ModeNodes.b();
	});

	it("enum value switch", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: Mode.schema }) {}
		const config = new TreeViewConfiguration({ schema: Parent });

		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: testIdCompressor }),
			"tree",
		);
		const view: TreeView<typeof Parent> = tree.viewWith(config);
		view.initialize(
			new Parent({
				mode: new Mode.Bonus(),
			}),
		);
		const mode = view.root.mode;
		switch (mode.value) {
			case "Fun": {
				assert.fail();
			}
			case "Cool": {
				assert.fail();
			}
			case "Bonus": {
				// This one runs
				break;
			}
			default:
				unreachableCase(mode.value);
		}
	});

	it("enum interop - enumFromStrings", () => {
		const factory = new TreeFactory({});

		enum Day {
			Today = "Today",
			Tomorrow = "Tomorrow",
		}

		const DayNodes = enumFromStrings(schema, unsafeArrayToTuple(Object.values(Day)));

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: testIdCompressor }),
			"tree",
		);

		const day = Day.Today;

		const view = tree.viewWith(new TreeViewConfiguration({ schema: DayNodes.schema }));
		view.initialize(DayNodes(day));

		switch (view.root.value) {
			case Day.Today: {
				// This one runs
				break;
			}
			case Day.Tomorrow: {
				assert.fail();
			}
			default:
				unreachableCase(view.root.value);
		}
	});

	it("enum interop - adaptEnum", () => {
		const factory = new TreeFactory({});

		enum Day {
			Today = "today",
			Tomorrow = "tomorrow",
		}

		const DayNodes = adaptEnum(schema, Day);

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: testIdCompressor }),
			"tree",
		);

		// Can convert enum to unhydrated node:
		const x = DayNodes(Day.Today);
		// Can construct unhydrated node from enum's key:
		const y = new DayNodes.Today();
		const z: Day.Today = y.value;

		const view = tree.viewWith(new TreeViewConfiguration({ schema: DayNodes.schema }));
		view.initialize(DayNodes(Day.Today));

		switch (view.root.value) {
			case Day.Today: {
				break;
			}
			case Day.Tomorrow: {
				assert.fail();
			}
			default:
				unreachableCase(view.root);
		}

		//  InsertableTreeFieldFromImplicitField<TRootSchema>
		{
			type InsertableImplicit = InsertableTreeFieldFromImplicitField<typeof DayNodes.schema>;

			type Insertable = InsertableTreeNodeFromAllowedTypes<typeof DayNodes.schema>;

			type FirstOption = (typeof DayNodes.schema)[0];
			type FirstInsertable = InsertableTypedNode<FirstOption>;

			type InsertableTreeNodeFromAllowedTypes2<TList extends AllowedTypes> =
				TList extends readonly [
					LazyItem<infer TSchema extends TreeNodeSchema>,
					...infer Rest extends AllowedTypes,
				]
					? InsertableTypedNode<TSchema> | InsertableTreeNodeFromAllowedTypes2<Rest>
					: never;

			type FirstInsertable2 = InsertableTreeNodeFromAllowedTypes2<typeof DayNodes.schema>;

			type X = [typeof DayNodes] extends [readonly [LazyItem<infer TSchema>, ...AllowedTypes]]
				? TSchema
				: 1;

			type X2 = [(typeof DayNodes.schema)[0]] extends [
				LazyItem<infer TSchema>,
				...AllowedTypes,
			]
				? TSchema
				: 1;

			type FirstInsertableWhat = What<typeof DayNodes>;
			type What<TList> = TList extends [infer TSchema, ...unknown[]] ? TSchema : 0;

			type Insertable3 = InsertableTreeNodeFromAllowedTypes3<typeof DayNodes.schema>;
			type InsertableTreeNodeFromAllowedTypes3<TList> = TList extends readonly [
				LazyItem<infer TSchema extends TreeNodeSchema>,
				// ...infer Rest extends AllowedTypes,
				...unknown[],
			]
				?
						| InsertableTypedNode<TSchema>
						| (TList extends readonly [unknown, ...infer Rest]
								? InsertableTreeNodeFromAllowedTypes3<Rest>
								: never)
				: never;

			type Insertable4 = InsertableTreeNodeFromAllowedTypes4<typeof DayNodes>;
			type InsertableTreeNodeFromAllowedTypes4<TList> = TList extends readonly [
				unknown,
				...infer Rest,
			]
				? Rest
				: 0;

			type Schema = [typeof DayNodes.Today, typeof DayNodes.Tomorrow];
			type Schema2 = [(typeof DayNodes.schema)[0], (typeof DayNodes.schema)[1]];
			type InsertableXX = InsertableTreeNodeFromAllowedTypes<typeof DayNodes & Schema2>;

			const xxxx: Insertable3 = new DayNodes.Today();
			const xxxx2: Insertable3 = new DayNodes.Tomorrow();
		}
	});
});
