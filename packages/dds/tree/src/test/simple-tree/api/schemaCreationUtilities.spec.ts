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
	type TreeNodeFromImplicitAllowedTypes,
} from "../../../simple-tree/index.js";
import {
	adaptEnum,
	enumFromStrings,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/schemaCreationUtilities.js";
import { TreeFactory } from "../../../treeFactory.js";
import { testIdCompressor, validateUsageError } from "../../utils.js";
import {
	unsafeArrayToTuple,
	type areSafelyAssignable,
	type isAssignableTo,
	type requireFalse,
	type requireTrue,
} from "../../../util/index.js";

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
		type Mode = TreeNodeFromImplicitAllowedTypes<typeof Mode.schema>;
		const nodeFromString: Mode = Mode("Fun");
		const nodeFromSchema: Mode = new Mode.Fun();

		// Schema nodes have a strongly typed `.value` property.
		const nameFromNode: "Fun" | "Cool" = nodeFromSchema.value;

		class Parent extends schemaFactory.object("Parent", { mode: Mode.schema }) {}
	});

	it("enumFromStrings - construction tests", () => {
		const schemaFactory = new SchemaFactory("com.myApp");

		const ModeNodes = enumFromStrings(new SchemaFactory(`${schemaFactory.scope}.Mode`), [
			"A",
			"B",
			"C",
		]);
		type ModeNodes = TreeNodeFromImplicitAllowedTypes<typeof ModeNodes.schema>;

		type I0 = NodeFromSchema<(typeof ModeNodes.schema)[0]>;
		type I1 = NodeFromSchema<(typeof ModeNodes.schema)[1]>;
		type I2 = NodeFromSchema<(typeof ModeNodes.schema)[2]>;

		type _checkI = requireTrue<areSafelyAssignable<I0 | I1 | I2, ModeNodes>>;

		type A = NodeFromSchema<typeof ModeNodes.A>;
		type B = NodeFromSchema<typeof ModeNodes.B>;

		type _checkDifferent = requireFalse<isAssignableTo<A, B>>;

		const fromLiteral = ModeNodes("A");
		type _check1 = requireTrue<areSafelyAssignable<typeof fromLiteral, A>>;
		const fromUnion = ModeNodes("A" as "A" | "B");
		type _check2 = requireTrue<areSafelyAssignable<typeof fromUnion, A | B>>;
		const fromAny = ModeNodes("A" as "A" | "B" | "C");
		type _check3 = requireTrue<areSafelyAssignable<typeof fromAny, ModeNodes>>;

		const fromA = new ModeNodes.A();
		type _checkA = requireTrue<areSafelyAssignable<typeof fromA, A>>;

		class Parent extends schemaFactory.object("Parent", {
			mode: ModeNodes.schema,
		}) {}

		const parent1 = new Parent({ mode: ModeNodes("A") });
		const parent2 = new Parent({ mode: ModeNodes("A" as "A" | "B") });
		const parent3 = new Parent({ mode: ModeNodes("A" as "A" | "B" | "C") });
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
		type ModeNodes = TreeNodeFromImplicitAllowedTypes<typeof ModeNodes.schema>;
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

	it("adaptEnum - numbers", () => {
		const schemaFactory = new SchemaFactory("com.myApp");
		enum Mode {
			a = 1,
			b = "b",
			c = 6.3,
		}
		const ModeNodes = adaptEnum(new SchemaFactory(`${schemaFactory.scope}.Mode`), Mode);
		type ModeNodes = TreeNodeFromImplicitAllowedTypes<typeof ModeNodes.schema>;

		const fromEnumValue = ModeNodes(Mode.a);
		type _check1 = requireTrue<
			areSafelyAssignable<typeof fromEnumValue, NodeFromSchema<typeof ModeNodes.a>>
		>;
		const fromEnumUnion = ModeNodes(Mode.a as Mode.a | Mode.b);
		type _check2 = requireTrue<
			areSafelyAssignable<
				typeof fromEnumUnion,
				NodeFromSchema<typeof ModeNodes.a> | NodeFromSchema<typeof ModeNodes.b>
			>
		>;
		const fromEnum = ModeNodes(Mode.a as Mode);
		type _check3 = requireTrue<areSafelyAssignable<typeof fromEnum, ModeNodes>>;

		assert.equal(fromEnumValue.value, Mode.a);
		assert.equal(fromEnumUnion.value, Mode.a);
		assert.equal(fromEnum.value, Mode.a);

		class Parent extends schemaFactory.object("Parent", {
			mode: ModeNodes.schema,
		}) {}

		const parent1 = new Parent({ mode: ModeNodes(Mode.a) });
		const parent2 = new Parent({ mode: ModeNodes(Mode.b as Mode.a | Mode.b) });
		const parent3 = new Parent({ mode: ModeNodes(Mode.c as Mode) });

		assert.equal(parent1.mode.value, Mode.a);
		assert.equal(parent2.mode.value, Mode.b);
		assert.equal(parent3.mode.value, Mode.c);
	});

	it("adaptEnum - construction tests", () => {
		const schemaFactory = new SchemaFactory("com.myApp");
		enum Mode {
			a = "A",
			b = "B",
			c = "C",
		}
		// Uses a nested schema factory, as recommended by adaptEnum's docs to ensure that pattern works.
		const ModeNodes = adaptEnum(new SchemaFactory(`${schemaFactory.scope}.Mode`), Mode);
		type ModeNodes = TreeNodeFromImplicitAllowedTypes<typeof ModeNodes.schema>;

		const fromEnumValue = ModeNodes(Mode.a);
		type _check1 = requireTrue<
			areSafelyAssignable<typeof fromEnumValue, NodeFromSchema<typeof ModeNodes.a>>
		>;
		const fromEnumUnion = ModeNodes(Mode.a as Mode.a | Mode.b);
		type _check2 = requireTrue<
			areSafelyAssignable<
				typeof fromEnumUnion,
				NodeFromSchema<typeof ModeNodes.a> | NodeFromSchema<typeof ModeNodes.b>
			>
		>;
		const fromEnum = ModeNodes(Mode.a as Mode);
		type _check3 = requireTrue<areSafelyAssignable<typeof fromEnum, ModeNodes>>;

		assert.equal(fromEnumValue.value, Mode.a);
		assert.equal(fromEnumUnion.value, Mode.a);
		assert.equal(fromEnum.value, Mode.a);

		class Parent extends schemaFactory.object("Parent", {
			mode: ModeNodes.schema,
		}) {}

		const parent1 = new Parent({ mode: ModeNodes(Mode.a) });
		const parent2 = new Parent({ mode: ModeNodes(Mode.b as Mode.a | Mode.b) });
		const parent3 = new Parent({ mode: ModeNodes(Mode.c as Mode) });

		assert.equal(parent1.mode.value, Mode.a);
		assert.equal(parent2.mode.value, Mode.b);
		assert.equal(parent3.mode.value, Mode.c);
	});

	it("adaptEnum example", () => {
		const schemaFactory = new SchemaFactory("x");

		enum Mode {
			a = "A",
			b = "B",
		}
		const ModeNodes = adaptEnum(schema, Mode);
		type ModeNodes = TreeNodeFromImplicitAllowedTypes<typeof ModeNodes.schema>;
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
		const Mode = enumFromStrings(schema, ["Fun", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: Mode.schema }) {}
		const root = new Parent({ mode: new Mode.Bonus() });
		const mode = root.mode;

		switch (mode.value) {
			case "Fun": {
				assert.fail();
			}
			case "Bonus": {
				// This one runs
				break;
			}
			default:
				unreachableCase(mode);
		}
	});

	it("enum value switch - minimal", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Bonus"]);
		type Mode = TreeNodeFromImplicitAllowedTypes<typeof Mode.schema>;

		// Removing this "as" cast, even if you explicitly put ": Mode" as the type does not work,
		// since TypeScript types the variable as the more specific "Bonus" node, causing the "Fun" case in the switch to not build.
		const node = new Mode.Bonus() as Mode;

		switch (node.value) {
			case "Fun": {
				assert.fail();
			}
			case "Bonus": {
				// This one runs
				break;
			}
			default:
				unreachableCase(node);
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
				unreachableCase(view.root);
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

	it("enum interop - adaptEnum numeric", () => {
		const factory = new TreeFactory({});

		enum Day {
			Today = 2,
			Tomorrow = 3,
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

	it("enum interop - adaptEnum collision", () => {
		enum Day {
			Today = 2,
			Tomorrow = "2",
		}

		const DayNodes = adaptEnum(schema, Day);

		assert.throws(
			() => new TreeViewConfiguration({ schema: DayNodes.schema }),
			validateUsageError(
				'Multiple schema encountered with the identifier "test.2". Remove or rename them to avoid the collision.',
			),
		);
	});
});
