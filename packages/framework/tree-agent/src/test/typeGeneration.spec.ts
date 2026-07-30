/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
import {
	getSimpleSchema,
	independentView,
	SchemaFactory,
	SchemaFactoryBeta,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
} from "@fluidframework/tree/internal";
import {
	buildFunc,
	exposeMethodsSymbol,
	exposePropertiesSymbol,
	type ExposedMethods,
	type ExposedProperties,
} from "@fluidframework/type-factory/alpha";

import { fluidHandleTypeName } from "../prompt.js";
import { typeFactory } from "../treeAgentTypes.js";
import { generateEditTypesForPrompt } from "../typeGeneration.js";

const sf = new SchemaFactory("test");

class Todo extends sf.object("Todo", {
	title: sf.string,
	completed: sf.boolean,
}) {
	public method(n: string): boolean {
		return false;
	}

	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.exposeMethod(
			Todo,
			"method",
			buildFunc({ returns: typeFactory.boolean() }, ["n", typeFactory.string()]),
		);
	}
}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.string,
	description: sf.string,
	todos: sf.array(Todo),
}) {
	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.exposeMethod(
			TestTodoAppSchema,
			"addTodo",
			buildFunc({ returns: typeFactory.instanceOf(Todo) }, [
				"todo",
				typeFactory.instanceOf(Todo),
			]),
		);
	}

	public addTodo(todo: Todo): Todo {
		this.todos.insertAtEnd(todo);
		return todo;
	}
}

const initialAppState = {
	title: "My First Todo List",
	description: "This is a list of todos",
	todos: [
		{
			title: "Task 1",
			completed: true,
		},
		{
			title: "Task 2",
			completed: true,
		},
	],
};

describe("Type generation", () => {
	it("for handle nodes", () => {
		class ObjWithHandle extends sf.object("ObjWithHandle", {
			handle: sf.optional(sf.handle),
		}) {}
		const handleSchemaString = getDomainSchemaString(ObjWithHandle, { handle: undefined });
		assert.deepEqual(
			handleSchemaString,
			`interface ObjWithHandle {
    handle?: ${fluidHandleTypeName};
}
`,
		);
	});

	describe("for schemas with methods", () => {
		it("works on object nodes", () => {
			class ObjWithMethod extends sf.object("ObjWithMethod", {}) {
				public method(n: string): boolean {
					return false;
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.exposeMethod(
						ObjWithMethod,
						"method",
						buildFunc({ returns: typeFactory.boolean() }, ["n", typeFactory.string()]),
					);
				}
			}

			const arrayDomainSchemaString = getDomainSchemaString(ObjWithMethod, {});
			assert.deepEqual(
				arrayDomainSchemaString,
				`interface ObjWithMethod {
    method(n: string): boolean;
}
`,
			);
		});

		it("works on array nodes", () => {
			class ArrayWithMethod extends sf.array("ArrayWithMethod", sf.string) {
				public method(n: string): boolean {
					return false;
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.exposeMethod(
						ArrayWithMethod,
						"method",
						buildFunc({ returns: typeFactory.boolean() }, ["n", typeFactory.string()]),
					);
				}
			}

			const arrayDomainSchemaString = getDomainSchemaString(ArrayWithMethod, ["test"]);
			assert.deepEqual(
				arrayDomainSchemaString,
				`// Note: this array has custom user-defined methods directly on it.
type ArrayWithMethod = string[] & {
    method(n: string): boolean;
};
`,
			);
		});

		it("works on map nodes", () => {
			class MapWithMethod extends sf.map("MapWithMethod", sf.string) {
				public method(n: string): boolean {
					return false;
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.exposeMethod(
						MapWithMethod,
						"method",
						buildFunc({ returns: typeFactory.boolean() }, ["n", typeFactory.string()]),
					);
				}
			}

			const mapDomainSchemaString = getDomainSchemaString(MapWithMethod, new Map());
			assert.deepEqual(
				mapDomainSchemaString,
				`// Note: this map has custom user-defined methods directly on it.
type MapWithMethod = Map<string, string> & {
    method(n: string): boolean;
};
`,
			);
		});

		it("handles return types that are nodes", () => {
			class Obj extends sf.object("Obj", {}) {}

			class MapWithMethod extends sf.map("MapWithMethod", sf.string) {
				public method(n: string): Obj {
					return new Obj({});
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.exposeMethod(
						MapWithMethod,
						"method",
						buildFunc({ returns: typeFactory.instanceOf(Obj) }, ["n", typeFactory.string()]),
					);
				}
			}

			const mapDomainSchemaString = getDomainSchemaString(MapWithMethod, new Map());
			assert.deepEqual(
				mapDomainSchemaString,
				`// Note: this map has custom user-defined methods directly on it.
type MapWithMethod = Map<string, string> & {
    method(n: string): Obj;
};
`,
			);
		});
	});

	describe("for schemas with properties", () => {
		it("works on object nodes", () => {
			class ObjWithProperty extends sf.object("ObjWithProperty", {}) {
				public testProperty: string = "property";
				public get property(): string {
					return this.testProperty;
				}
				public static [exposePropertiesSymbol](properties: ExposedProperties): void {
					properties.exposeProperty(ObjWithProperty, "testProperty", {
						schema: typeFactory.string(),
					});
					properties.exposeProperty(ObjWithProperty, "property", {
						schema: typeFactory.string(),
						readOnly: true,
					});
				}
			}

			const arrayDomainSchemaString = getDomainSchemaString(ObjWithProperty, {});
			assert.deepEqual(
				arrayDomainSchemaString,
				`interface ObjWithProperty {
    testProperty: string;
    readonly property: string;
}
`,
			);
		});

		it("works on array nodes", () => {
			class ArrayWithProperty extends sf.array("ArrayWithProperty", sf.string) {
				public testProperty: string = "property";
				public get property(): string {
					return this.testProperty;
				}
				public static [exposePropertiesSymbol](properties: ExposedProperties): void {
					properties.exposeProperty(ArrayWithProperty, "testProperty", {
						schema: typeFactory.string(),
					});
					properties.exposeProperty(ArrayWithProperty, "property", {
						schema: typeFactory.string(),
						readOnly: true,
					});
				}
			}

			const arrayDomainSchemaString = getDomainSchemaString(ArrayWithProperty, ["test"]);
			assert.deepEqual(
				arrayDomainSchemaString,
				`// Note: this array has custom user-defined properties directly on it.
type ArrayWithProperty = string[] & {
    testProperty: string;
    readonly property: string;
};
`,
			);
		});

		it("works on map nodes", () => {
			class MapWithProperty extends sf.map("MapWithProperty", sf.string) {
				public testProperty: string = "testProperty";
				public get property(): string {
					return this.testProperty;
				}
				public static [exposePropertiesSymbol](properties: ExposedProperties): void {
					properties.exposeProperty(MapWithProperty, "testProperty", {
						schema: typeFactory.string(),
					});
					properties.exposeProperty(MapWithProperty, "property", {
						schema: typeFactory.string(),
						readOnly: true,
					});
				}
			}

			const mapDomainSchemaString = getDomainSchemaString(MapWithProperty, new Map());
			assert.deepEqual(
				mapDomainSchemaString,
				`// Note: this map has custom user-defined properties directly on it.
type MapWithProperty = Map<string, string> & {
    testProperty: string;
    readonly property: string;
};
`,
			);
		});
	});

	it("includes TypeScript types for node schema", () => {
		const view = independentView(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
		view.initialize(initialAppState);

		const schema = getSimpleSchema(view.schema);

		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);
		assert.notDeepEqual(
			schemaText,
			`interface Todo {
			title: string;
			completed: boolean;
			method(n: string): boolean;
		}

		interface TestTodoAppSchema {
			title: string;
			description: string;
			todos: Todo[];
			addTodo(todo: Todo): Todo;
		}
		`,
		);
	});

	it("handles schema short name collisions", () => {
		const sf1 = new SchemaFactory("scope1");
		const sf2 = new SchemaFactory("scope2");
		const sf3 = new SchemaFactory("scope3");

		// Three "Foo" schemas from different scopes collide
		class Foo1 extends sf1.object("Foo", { value: sf1.number }) {}
		class Foo2 extends sf2.object("Foo", { value: sf2.number }) {}
		class Foo3 extends sf3.object("Foo", { value: sf3.number }) {}
		// "Bar" is unique — no collision
		class Bar extends sf1.object("Bar", { value: sf1.number }) {}
		// Two "Foo_1" schemas collide with each other
		class Foo_1A extends sf1.object("Foo_1", { value: sf1.number }) {}
		class Foo_1B extends sf2.object("Foo_1", { value: sf2.number }) {}
		// Natural "Foo_2" conflicts with the counter-generated "Foo_2" from Foo collisions
		class NaturalFoo2 extends sf3.object("Foo_2", { value: sf3.number }) {}

		class TestObject extends sf.object("Container", {
			foo1: Foo1,
			foo2: Foo2,
			foo3: Foo3,
			bar: Bar,
			foo1A: Foo_1A,
			foo1B: Foo_1B,
			naturalFoo2: NaturalFoo2,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: TestObject }));
		view.initialize({
			foo1: { value: 1 },
			foo2: { value: 2 },
			foo3: { value: 3 },
			bar: { value: 4 },
			foo1A: { value: 5 },
			foo1B: { value: 6 },
			naturalFoo2: { value: 7 },
		});

		const schema = getSimpleSchema(view.schema);
		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);

		// Three "Foo" collisions: first keeps name, subsequent get _2, _3
		assert.ok(schemaText.includes("interface Foo {"), "First Foo keeps original name");
		assert.ok(schemaText.includes("interface Foo_2 {"), "Second Foo gets _2");
		assert.ok(schemaText.includes("interface Foo_3 {"), "Third Foo gets _3");
		// Non-colliding name keeps original
		assert.ok(schemaText.includes("interface Bar {"), "Unique Bar keeps original name");
		assert.ok(!schemaText.includes("interface Bar_2"), "Bar should not have collision suffix");
		// Two "Foo_1" collisions
		assert.ok(schemaText.includes("interface Foo_1 {"), "First Foo_1 keeps original name");
		assert.ok(schemaText.includes("interface Foo_1_2"), "Second Foo_1 gets _2");
		// Natural "Foo_2" conflicts with counter-generated "Foo_2"
		assert.ok(
			schemaText.includes("interface Foo_2_2"),
			"Natural Foo_2 becomes Foo_2_2 since Foo_2 was taken",
		);
	});

	describe("handles staged allowed types", () => {
		const sfBeta = new SchemaFactoryBeta("staged-type-tests");
		const sfAlpha = new SchemaFactoryAlpha("staged-type-tests");

		it("for object nodes", () => {
			class ObjWithStagedType extends sfBeta.object("ObjWithStagedType", {
				foo: SchemaFactoryBeta.types([
					SchemaFactoryBeta.string,
					SchemaFactoryBeta.staged(SchemaFactoryBeta.number),
				]),
			}) {}

			const objectDomainSchemaString = getDomainSchemaString(ObjWithStagedType, {
				foo: "test",
			});
			assert.deepEqual(
				objectDomainSchemaString,
				`interface ObjWithStagedType {
    get foo(): string | number;
    set foo(value: string);
}
`,
			);
		});

		it("for optional object node fields", () => {
			class ObjWithOptionalStagedType extends sfBeta.object("ObjWithOptionalStagedType", {
				foo: sfBeta.optional(
					SchemaFactoryBeta.types([
						SchemaFactoryBeta.string,
						SchemaFactoryBeta.staged(SchemaFactoryBeta.number),
					]),
				),
			}) {}

			const objectDomainSchemaString = getDomainSchemaString(ObjWithOptionalStagedType, {
				foo: "test",
			});
			assert.deepEqual(
				objectDomainSchemaString,
				`interface ObjWithOptionalStagedType {
    get foo(): string | number | undefined;
    set foo(value: string | undefined);
}
`,
			);
		});

		it("for array nodes", () => {
			class StagedArray extends sfBeta.array(
				"StagedArray",
				SchemaFactoryBeta.types([
					SchemaFactoryBeta.string,
					SchemaFactoryBeta.staged(SchemaFactoryBeta.number),
				]),
			) {}

			const schemaString = getDomainSchemaString(StagedArray, ["hello"]);
			assert.deepEqual(
				schemaString,
				`type StagedArray = TreeArray<(string | number), string>;\n`,
			);
		});

		it("for map nodes", () => {
			class StagedMap extends sfBeta.map(
				"StagedMap",
				SchemaFactoryBeta.types([
					SchemaFactoryBeta.string,
					SchemaFactoryBeta.staged(SchemaFactoryBeta.number),
				]),
			) {}

			const schemaString = getDomainSchemaString(StagedMap, new Map([["a", "alpha"]]));
			assert.deepEqual(schemaString, `type StagedMap = TreeMap<(string | number), string>;\n`);
		});

		it("for record nodes", () => {
			class StagedRecord extends sfAlpha.recordAlpha(
				"StagedRecord",
				SchemaFactoryBeta.types([
					SchemaFactoryBeta.string,
					SchemaFactoryBeta.staged(SchemaFactoryBeta.number),
				]),
			) {}

			const schemaString = getDomainSchemaString(StagedRecord, { a: "alpha" });
			assert.deepEqual(
				schemaString,
				`// Warning: do not set record values to any of the following types (they are staged and not yet writeable): number\ntype StagedRecord = Record<string, string | number>;\n`,
			);
		});
	});
});

function getDomainSchemaString<TSchema extends ImplicitFieldSchema>(
	schemaClass: TSchema,
	initialValue: InsertableField<TSchema>,
): string {
	const view = independentView(new TreeViewConfiguration({ schema: schemaClass }));
	view.initialize(initialValue);
	const schema = getSimpleSchema(view.schema);
	const { schemaText } = generateEditTypesForPrompt(view.schema, schema);
	return schemaText;
}
