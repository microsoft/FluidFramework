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

// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("enums");

function Enum<TFactory extends SchemaFactory, const Members extends string>(
	factory: TFactory,
	members: Members[],
) {
	const names = new Set(members);
	if (names.size !== members.length) {
		throw new UsageError("All members of enums must have distinct names");
	}

	function makeSchema<TName extends string>(name: TName) {
		return class EnumMember extends factory.object(name, {}) {
			public get value(): TName {
				return name;
			}
		};
	}

	const out: Record<Members, ReturnType<typeof makeSchema<Members>>> = Object.create(null);
	for (const name of members) {
		Object.defineProperty(out, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: makeSchema(name),
		});
	}

	return out;
}

const Mode = Enum(schema, ["Fun", "Cool", "Bonus"]);

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
				// This one runs
				break;
			}
			case "Cool": {
				assert.fail();
			}
			case "Bonus": {
				assert.fail();
			}
			default:
				unreachableCase(mode.value);
		}
	});

	it("enum interop", () => {
		const factory = new TreeFactory({});

		enum Day {
			Today = "Today",
			Tomorrow = "Tomorrow",
		}

		const DayNodes = Enum(schema, Object.values(Day));

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
});
