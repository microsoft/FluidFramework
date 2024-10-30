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
		const schemaFactory = new SchemaFactory("com.myApp");
		const Mode = enumFromStrings(schemaFactory, ["Fun", "Cool"]);
		type Mode = NodeFromSchema<(typeof Mode.schema)[number]>;
		const nodeFromString: Mode = Mode("Fun");
		const nodeFromSchema: Mode = new Mode.Fun();

		// Schema nodes have a strongly typed `.value` property.
		const nameFromNode: "Fun" | "Cool" = nodeFromSchema.value;

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
			// adaptEnum's return value has a ".schema" property can be use as an `AllowedTypes` array allowing any of the members of the enum.
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

		const nameFromNode: Mode = nodeFromSchema.value;

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
			// Regression test for adapted schema working with InsertableTreeFieldFromImplicitField
			type InsertableImplicit = InsertableTreeFieldFromImplicitField<typeof DayNodes.schema>;

			const _a: InsertableImplicit = new DayNodes.Today();
			const _b: InsertableImplicit = new DayNodes.Tomorrow();
		}
	});
});
