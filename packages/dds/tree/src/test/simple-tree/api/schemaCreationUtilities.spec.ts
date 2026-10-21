/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import {
	adaptEnum,
	enumEntries,
	enumFromStrings,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../simple-tree/api/schemaCreationUtilities.js";
import {
	type NodeFromSchema,
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
	type InsertableTreeFieldFromImplicitField,
	type TreeNodeFromImplicitAllowedTypes,
	SchemaFactoryBeta,
} from "../../../simple-tree/index.js";
import {
	unsafeArrayToTuple,
	type areSafelyAssignable,
	type isAssignableTo,
	type requireFalse,
	type requireTrue,
} from "../../../util/index.js";
import { testSchemaCompatibilitySnapshots } from "../../snapshots/index.js";
import { getView } from "../../utils.js";

const schema = new SchemaFactoryBeta("test");

describe("schemaCreationUtilities", () => {
	it("enumFromStrings compatibility", () => {
		// There is not a single fixed enum schema, but instead a collection of utilities that generate enum schemas.
		// Therefore we cannot directly utilize `testSchemaCompatibilitySnapshots`, but we can apply it to one example use of enumFromStrings
		// which is what this test does.
		const Mode = enumFromStrings(schema.scopedFactory("Mode"), ["Fun", "Cool"]);
		const currentViewSchema = new TreeViewConfiguration({ schema: Mode.schema });
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.82.0", "enumFromStrings-example");
	});

	it("adaptEnum compatibility", () => {
		// There is not a single fixed enum schema, but instead a collection of utilities that generate enum schemas.
		// Therefore, we cannot directly utilize `testSchemaCompatibilitySnapshots`, but we can apply it to one example use of adaptEnum
		// which is what this test does.
		enum Mode {
			a = "A",
			b = "B",
		}
		const ModeNodes = adaptEnum(schema.scopedFactory("Mode"), Mode);
		const currentViewSchema = new TreeViewConfiguration({ schema: ModeNodes.schema });
		testSchemaCompatibilitySnapshots(currentViewSchema, "2.82.0", "adaptEnum-example");
	});

	it("enum type switch", () => {
		const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);
		class Parent extends schema.object("Parent", { mode: Mode.schema }) {}
		const config = new TreeViewConfiguration({ schema: Parent });

		const view: TreeView<typeof Parent> = getView(config);
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
			default: {
				assert.fail();
			}
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
		const schemaFactory = new SchemaFactoryBeta("com.myApp");

		const ModeNodes = enumFromStrings(schemaFactory.scopedFactory("Mode"), ["A", "B", "C"]);
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

	// Using the schema of a large enum as a field's allowed types must stay cheap to type-check.
	// If the type of `schema` grows super-linearly in cost with the number of members, compiling this test becomes very slow.
	it("enumFromStrings - large enum", () => {
		const schemaFactory = new SchemaFactoryBeta("com.myApp");
		const Large = enumFromStrings(schemaFactory.scopedFactory("Large"), largeEnumMembers);
		type LargeSchema = typeof Large.schema;
		type LargeMember = (typeof largeEnumMembers)[number];

		// `schema` is a tuple with one entry per member, in the order the members were provided.
		type _checkLength = requireTrue<areSafelyAssignable<LargeSchema["length"], 250>>;
		type _checkFirst = requireTrue<areSafelyAssignable<LargeSchema[0], typeof Large.Member0>>;
		type _checkLast = requireTrue<
			areSafelyAssignable<LargeSchema[249], typeof Large.Member249>
		>;
		assert.equal(Large.schema.length, 250);
		assert.equal(Large.schema[0], Large.Member0);
		assert.equal(Large.schema[249], Large.Member249);

		class Parent extends schemaFactory.object("Parent", { mode: Large.schema }) {}

		const parent = new Parent({ mode: Large("Member249") });
		type _checkNode = requireTrue<
			areSafelyAssignable<typeof parent.mode, TreeNodeFromImplicitAllowedTypes<LargeSchema>>
		>;
		type _checkValue = requireTrue<areSafelyAssignable<typeof parent.mode.value, LargeMember>>;
		assert.equal(parent.mode.value, "Member249");

		parent.mode = new Large.Member0();
		assert.equal(parent.mode.value, "Member0");
	});

	it("adaptEnum example from docs", () => {
		const schemaFactory = new SchemaFactoryBeta("com.myApp");
		// An enum for use in the tree. Must have string keys.
		enum Mode {
			a = "A",
			b = "B",
		}
		// Define the schema for each member of the enum using a nested scope to group them together.
		const ModeNodes = adaptEnum(schemaFactory.scopedFactory("Mode"), Mode);
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
		const schemaFactory = new SchemaFactoryBeta("com.myApp");
		enum Mode {
			a = 1,
			b = "B",
			c = 6.3,
		}
		const f = schemaFactory.scopedFactory("Mode");

		type Scope = typeof f extends SchemaFactoryBeta<infer S> ? S : never;
		type _check0 = requireTrue<areSafelyAssignable<Scope, "com.myApp.Mode">>;

		const ModeNodes = adaptEnum(f, Mode);
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

		assert.deepEqual(ModeNodes.schema, [ModeNodes.a, ModeNodes.b, ModeNodes.c]);

		const x = new ModeNodes.a().value;
		const y = new ModeNodes.b().value;
		const z = new ModeNodes.c().value;

		type _check4 = requireTrue<areSafelyAssignable<typeof x, Mode.a>>;
		type _check5 = requireTrue<areSafelyAssignable<typeof y, Mode.b>>;
		type _check6 = requireTrue<areSafelyAssignable<typeof z, Mode.c>>;
	});

	it("scoping", () => {
		const schemaFactory = new SchemaFactoryBeta("com.myApp");
		enum Mode {
			a,
		}
		const f = schemaFactory.scopedFactory("Mode");

		type Scope = typeof f extends SchemaFactoryBeta<infer S> ? S : never;
		type _check0 = requireTrue<areSafelyAssignable<Scope, "com.myApp.Mode">>;

		const ModeNodes = adaptEnum(f, Mode);

		type AType = typeof ModeNodes.a.identifier;

		assert.equal(ModeNodes.a.identifier, "com.myApp.Mode.0");

		// TODO: AB#43345
		// This should be just "com.myApp.Mode.0", but due to known issue.
		// See comments on adaptEnum and "variance with respect to scope and alpha" test.
		type _check = requireTrue<areSafelyAssignable<AType, "com.myApp.Mode.0" | "com.0">>;
	});

	it("adaptEnum - construction tests", () => {
		const schemaFactory = new SchemaFactoryBeta("com.myApp");
		enum Mode {
			a = "A",
			b = "B",
			c = "C",
		}
		// Uses a nested schema factory, as recommended by adaptEnum's docs to ensure that pattern works.
		const ModeNodes = adaptEnum(schemaFactory.scopedFactory("Mode"), Mode);
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

	it("adaptEnum workaround", () => {
		const schemaFactory = new SchemaFactory("x");

		// Old
		{
			enum Mode {
				a = 1,
			}
			const ModeNodes = adaptEnum(schemaFactory, Mode);
			const union = ModeNodes.schema;
		}

		// New
		{
			enum Mode {
				a = 1,
			}
			const ModeNodes = adaptEnum(schemaFactory, Mode);
			// Bugged version of adaptEnum used to include this: it should not be used.
			class Workaround extends schemaFactory.object("a", {}) {}
			const union = [...ModeNodes.schema, Workaround] as const;
		}
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
			default: {
				unreachableCase(mode);
			}
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
			default: {
				unreachableCase(node);
			}
		}
	});

	it("enum interop - enumFromStrings", () => {
		enum Day {
			Today = "Today",
			Tomorrow = "Tomorrow",
		}

		const DayNodes = enumFromStrings(schema, unsafeArrayToTuple(Object.values(Day)));

		const day = Day.Today;

		const view = getView(new TreeViewConfiguration({ schema: DayNodes.schema }));
		view.initialize(DayNodes(day));

		switch (view.root.value) {
			case Day.Today: {
				// This one runs
				break;
			}
			case Day.Tomorrow: {
				assert.fail();
			}
			default: {
				unreachableCase(view.root);
			}
		}
	});

	it("enum interop - adaptEnum", () => {
		enum Day {
			Today = "today",
			Tomorrow = "tomorrow",
		}

		const DayNodes = adaptEnum(schema, Day);

		// Can convert enum to unhydrated node:
		const x = DayNodes(Day.Today);
		// Can construct unhydrated node from enum's key:
		const y = new DayNodes.Today();
		const z: Day.Today = y.value;

		const view = getView(new TreeViewConfiguration({ schema: DayNodes.schema }));
		view.initialize(DayNodes(Day.Today));

		switch (view.root.value) {
			case Day.Today: {
				break;
			}
			case Day.Tomorrow: {
				assert.fail();
			}
			default: {
				unreachableCase(view.root);
			}
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
		enum Day {
			Today = 2,
			Tomorrow = 3,
		}

		const DayNodes = adaptEnum(schema, Day);

		// Can convert enum to unhydrated node:
		const x = DayNodes(Day.Today);
		// Can construct unhydrated node from enum's key:
		const y = new DayNodes.Today();
		const z: Day.Today = y.value;

		const view = getView(new TreeViewConfiguration({ schema: DayNodes.schema }));
		view.initialize(DayNodes(Day.Today));

		switch (view.root.value) {
			case Day.Today: {
				break;
			}
			case Day.Tomorrow: {
				assert.fail();
			}
			default: {
				unreachableCase(view.root);
			}
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

	describe("enumEntries", () => {
		it("string enum", () => {
			enum TestEnum {
				A = "a",
				B = "b",
			}

			const entries = enumEntries(TestEnum);
			assert.deepEqual(entries, [
				["A", "a"],
				["B", "b"],
			]);
		});

		it("numeric enum", () => {
			enum TestEnum {
				A = 1,
				B = 2,
			}

			const entries = enumEntries(TestEnum);
			assert.deepEqual(entries, [
				["A", 1],
				["B", 2],
			]);
		});

		it("edge cases", () => {
			enum TestEnum {
				"1.0" = "a",
				A = "b",
				"-0" = "c",
				// Due to https://github.com/microsoft/TypeScript/issues/61993 this produces 0 not -0
				"+1.1" = -0,
				// Actually -0
				"1.10" = (() => -0)(),
			}

			const entries = enumEntries(TestEnum);
			assert.deepEqual(entries, [
				["1.0", "a"],
				["A", "b"],
				["-0", "c"],
				["+1.1", 0],
				["1.10", -0],
			]);
		});

		it("malformed enums", () => {
			// See https://github.com/microsoft/TypeScript/issues/48956
			// TypeScript screws this case up in an undetectable way, but confirm it doesn't assert.
			enum TestEnumNumber {
				Infinity = Number.POSITIVE_INFINITY,
				NaN = Number.NaN,
			}

			enum TestEnumString {
				Infinity = "Infinity",
				NaN = "NaN",
			}

			// Since these two enums are deeply equal (checked here),
			// there is nothing we can do to to make the number case work correctly.
			assert.deepEqual(TestEnumNumber, TestEnumString);

			const entries = enumEntries(TestEnumNumber);
			assert.deepEqual(entries, [
				["Infinity", "Infinity"],
				["NaN", "NaN"],
			]);
		});
	});
});

/**
 * Members for an enum large enough to make the cost of type-checking its schema noticeable.
 */
const largeEnumMembers = [
	"Member0",
	"Member1",
	"Member2",
	"Member3",
	"Member4",
	"Member5",
	"Member6",
	"Member7",
	"Member8",
	"Member9",
	"Member10",
	"Member11",
	"Member12",
	"Member13",
	"Member14",
	"Member15",
	"Member16",
	"Member17",
	"Member18",
	"Member19",
	"Member20",
	"Member21",
	"Member22",
	"Member23",
	"Member24",
	"Member25",
	"Member26",
	"Member27",
	"Member28",
	"Member29",
	"Member30",
	"Member31",
	"Member32",
	"Member33",
	"Member34",
	"Member35",
	"Member36",
	"Member37",
	"Member38",
	"Member39",
	"Member40",
	"Member41",
	"Member42",
	"Member43",
	"Member44",
	"Member45",
	"Member46",
	"Member47",
	"Member48",
	"Member49",
	"Member50",
	"Member51",
	"Member52",
	"Member53",
	"Member54",
	"Member55",
	"Member56",
	"Member57",
	"Member58",
	"Member59",
	"Member60",
	"Member61",
	"Member62",
	"Member63",
	"Member64",
	"Member65",
	"Member66",
	"Member67",
	"Member68",
	"Member69",
	"Member70",
	"Member71",
	"Member72",
	"Member73",
	"Member74",
	"Member75",
	"Member76",
	"Member77",
	"Member78",
	"Member79",
	"Member80",
	"Member81",
	"Member82",
	"Member83",
	"Member84",
	"Member85",
	"Member86",
	"Member87",
	"Member88",
	"Member89",
	"Member90",
	"Member91",
	"Member92",
	"Member93",
	"Member94",
	"Member95",
	"Member96",
	"Member97",
	"Member98",
	"Member99",
	"Member100",
	"Member101",
	"Member102",
	"Member103",
	"Member104",
	"Member105",
	"Member106",
	"Member107",
	"Member108",
	"Member109",
	"Member110",
	"Member111",
	"Member112",
	"Member113",
	"Member114",
	"Member115",
	"Member116",
	"Member117",
	"Member118",
	"Member119",
	"Member120",
	"Member121",
	"Member122",
	"Member123",
	"Member124",
	"Member125",
	"Member126",
	"Member127",
	"Member128",
	"Member129",
	"Member130",
	"Member131",
	"Member132",
	"Member133",
	"Member134",
	"Member135",
	"Member136",
	"Member137",
	"Member138",
	"Member139",
	"Member140",
	"Member141",
	"Member142",
	"Member143",
	"Member144",
	"Member145",
	"Member146",
	"Member147",
	"Member148",
	"Member149",
	"Member150",
	"Member151",
	"Member152",
	"Member153",
	"Member154",
	"Member155",
	"Member156",
	"Member157",
	"Member158",
	"Member159",
	"Member160",
	"Member161",
	"Member162",
	"Member163",
	"Member164",
	"Member165",
	"Member166",
	"Member167",
	"Member168",
	"Member169",
	"Member170",
	"Member171",
	"Member172",
	"Member173",
	"Member174",
	"Member175",
	"Member176",
	"Member177",
	"Member178",
	"Member179",
	"Member180",
	"Member181",
	"Member182",
	"Member183",
	"Member184",
	"Member185",
	"Member186",
	"Member187",
	"Member188",
	"Member189",
	"Member190",
	"Member191",
	"Member192",
	"Member193",
	"Member194",
	"Member195",
	"Member196",
	"Member197",
	"Member198",
	"Member199",
	"Member200",
	"Member201",
	"Member202",
	"Member203",
	"Member204",
	"Member205",
	"Member206",
	"Member207",
	"Member208",
	"Member209",
	"Member210",
	"Member211",
	"Member212",
	"Member213",
	"Member214",
	"Member215",
	"Member216",
	"Member217",
	"Member218",
	"Member219",
	"Member220",
	"Member221",
	"Member222",
	"Member223",
	"Member224",
	"Member225",
	"Member226",
	"Member227",
	"Member228",
	"Member229",
	"Member230",
	"Member231",
	"Member232",
	"Member233",
	"Member234",
	"Member235",
	"Member236",
	"Member237",
	"Member238",
	"Member239",
	"Member240",
	"Member241",
	"Member242",
	"Member243",
	"Member244",
	"Member245",
	"Member246",
	"Member247",
	"Member248",
	"Member249",
] as const;
