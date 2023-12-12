/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { unreachableCase } from "@fluidframework/core-utils";
import { NodeFromSchema, SchemaFactory, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";
import {
	enumFromStrings,
	typedObjectValues,
	adaptEnum,
	// eslint-disable-next-line import/no-internal-modules
} from "../../class-tree/schemaCreationUtilities";

const schema = new SchemaFactory("test");

describe("schemaCreationUtilities", () => {
	it("enum type switch", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: Object.values(Mode) }) {}
		const config = new TreeConfiguration(
			Parent,
			() =>
				new Parent({
					mode: new Mode.Bonus({}),
				}),
		);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Parent> = tree.schematize(config);
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
		type Mode = NodeFromSchema<(typeof Mode)[keyof typeof Mode]>;
		const nodeFromString: Mode = Mode("Fun");
		const nodeFromSchema: Mode = new Mode.Fun();
		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Check this compiles, but don't run it since node is unhydrated
			const nameFromNode: "Fun" | "Cool" = nodeFromSchema.value;
		}

		class Parent extends schemaFactory.object("Parent", { mode: typedObjectValues(Mode) }) {}
	});

	it("adaptEnum example", () => {
		const schemaFactory = new SchemaFactory("x");

		enum Mode {
			a = "A",
			b = "B",
		}
		const ModeNodes = adaptEnum(schema, Mode);
		type ModeNodes = NodeFromSchema<(typeof ModeNodes)[keyof typeof ModeNodes]>;
		const nodeFromString: ModeNodes = ModeNodes(Mode.a);
		const nodeFromSchema: ModeNodes = new ModeNodes.a();
		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Check this compiles, but don't run it since node is unhydrated
			const nameFromNode: Mode = nodeFromSchema.value;
		}
		class Parent extends schemaFactory.object("Parent", {
			mode: typedObjectValues(ModeNodes),
		}) {}
	});

	it("enum value switch", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: typedObjectValues(Mode) }) {}
		const config = new TreeConfiguration(
			Parent,
			() =>
				new Parent({
					mode: new Mode.Bonus({}),
				}),
		);

		const factory = new TreeFactory({});
		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");
		const view: TreeView<Parent> = tree.schematize(config);
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

		const DayNodes = enumFromStrings(schema, typedObjectValues(Day));

		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const day = Day.Today;

		const view = tree.schematize(
			new TreeConfiguration(typedObjectValues(DayNodes), () => DayNodes(day)),
		);

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

		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		// Can convert enum to unhydrated node:
		const x = DayNodes(Day.Today);
		// Can construct unhydrated node from enum's key:
		const y = new DayNodes.Today({});

		const view = tree.schematize(
			new TreeConfiguration(typedObjectValues(DayNodes), () => DayNodes(Day.Today)),
		);

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
	});
});
