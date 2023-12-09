/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaFactory, TreeConfiguration, TreeView } from "../../class-tree";
import { TreeFactory } from "../../treeFactory";

// Since this no longer follows the builder pattern, it is a SchemaFactory instead of a SchemaBuilder.
const schema = new SchemaFactory("enums");

function Enum<TFactory extends SchemaFactory, const Members extends string>(
	factory: TFactory,
	members: Members[],
) {
	// eslint-disable-next-line @typescript-eslint/ban-types
	const out: Record<Members, ReturnType<typeof factory.object<Members, {}>>> = Object.create(
		null,
	);
	for (const name of members) {
		Object.defineProperty(out, name, {
			enumerable: true,
			configurable: false,
			writable: false,
			value: factory.object(name, {}),
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
	it("run example", () => {
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
				break;
			}
			case mode instanceof Mode.Cool: {
				assert.fail();
				break;
			}
			default:
				assert.fail();
		}
	});
});
