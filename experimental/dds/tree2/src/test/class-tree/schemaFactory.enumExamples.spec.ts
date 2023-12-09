/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils";
import { unreachableCase } from "@fluidframework/core-utils";
import { SchemaFactory, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";
import { fail } from "../../util";
import { EmptyObject } from "../../feature-libraries";

// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("enums");

/**
 * Create a schema for a node with no state.
 * @remarks
 * This is commonly used in unions when the only information needed is which kind of node the value is.
 * Enums are a common example of this pattern.
 */
function singletonSchema<TScope extends string, TName extends string>(
	factory: SchemaFactory<TScope>,
	name: TName,
) {
	return class SingletonSchema extends factory.object(name, {}) {
		public constructor(data?: EmptyObject) {
			super(data ?? {});
		}
		public get value(): TName {
			return name;
		}
	};
}

function adaptEnum<TScope extends string, const TEnum extends Record<string, string>>(
	factory: SchemaFactory<TScope>,
	members: TEnum,
) {
	type Values = TEnum[keyof TEnum];
	const values = Object.values(members) as Values[];
	const inverse = new Map(Object.entries(members).map(([key, value]) => [value, key])) as Map<
		Values,
		keyof TEnum
	>;

	if (inverse.size !== values.length) {
		throw new UsageError("All members of enums must have distinct values.");
	}

	type TOut = {
		readonly [Property in keyof TEnum]: ReturnType<
			typeof singletonSchema<TScope, TEnum[Property]>
		>;
	};
	const factoryOut = <TValue extends Values>(value: TValue) => {
		return new out[inverse.get(value) ?? fail("missing enum value")](
			{},
		) as unknown as ReturnType<typeof singletonSchema<TScope, TValue>>;
	};
	const out = factoryOut as typeof factoryOut & TOut;
	for (const [key, value] of Object.entries(members)) {
		Object.defineProperty(out, key, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: singletonSchema(factory, value),
		});
	}

	return out;
}

function enumFromStrings<TScope extends string, const Members extends string>(
	factory: SchemaFactory<TScope>,
	members: Members[],
) {
	const names = new Set(members);
	if (names.size !== members.length) {
		throw new UsageError("All members of enums must have distinct values");
	}

	const out: Record<Members, ReturnType<typeof singletonSchema<TScope, Members>>> = Object.create(
		null,
	);
	for (const name of members) {
		Object.defineProperty(out, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: singletonSchema(factory, name),
		});
	}

	return out;
}

function typedObjectValues<TKey extends string, TValues>(object: Record<TKey, TValues>): TValues[] {
	return Object.values(object);
}

const Mode = enumFromStrings(schema, ["Fun", "Cool", "Bonus"]);

class Parent extends schema.object("Parent", { mode: Object.values(Mode) }) {}

const config = new TreeConfiguration(
	Parent,
	() =>
		new Parent({
			mode: new Mode.Bonus({}),
		}),
);

describe("Enum union example", () => {
	it("type switch", () => {
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

	it("value switch", () => {
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

		const DayNodes = enumFromStrings(schema, Object.values(Day));

		const tree = factory.create(new MockFluidDataStoreRuntime(), "tree");

		const day = Day.Today;

		const view = tree.schematize(
			new TreeConfiguration(Object.values(DayNodes), () => new DayNodes[day]({})),
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
