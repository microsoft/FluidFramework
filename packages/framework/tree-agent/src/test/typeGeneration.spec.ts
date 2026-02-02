/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	getSimpleSchema,
	independentView,
	SchemaFactory,
	TreeViewConfiguration,
	type ImplicitFieldSchema,
	type InsertableField,
} from "@fluidframework/tree/internal";
import { z } from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";
import { exposePropertiesSymbol, type ExposedProperties } from "../propertyBinding.js";
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
		methods.expose(Todo, "method", buildFunc({ returns: z.boolean() }, ["n", z.string()]));
	}
}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.string,
	description: sf.string,
	todos: sf.array(Todo),
}) {
	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(
			TestTodoAppSchema,
			"addTodo",
			buildFunc({ returns: methods.instanceOf(Todo) }, ["todo", methods.instanceOf(Todo)]),
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
	describe("for schemas with methods", () => {
		it("works on object nodes", () => {
			class ObjWithMethod extends sf.object("ObjWithMethod", {}) {
				public method(n: string): boolean {
					return false;
				}

				public static [exposeMethodsSymbol](methods: ExposedMethods): void {
					methods.expose(
						ObjWithMethod,
						"method",
						buildFunc({ returns: z.boolean() }, ["n", z.string()]),
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
					methods.expose(
						ArrayWithMethod,
						"method",
						buildFunc({ returns: z.boolean() }, ["n", z.string()]),
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
					methods.expose(
						MapWithMethod,
						"method",
						buildFunc({ returns: z.boolean() }, ["n", z.string()]),
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
					methods.expose(
						MapWithMethod,
						"method",
						buildFunc({ returns: methods.instanceOf(Obj) }, ["n", z.string()]),
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
					properties.exposeProperty(ObjWithProperty, "testProperty", { schema: z.string() });
					properties.exposeProperty(ObjWithProperty, "property", {
						schema: z.string(),
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
					properties.exposeProperty(ArrayWithProperty, "testProperty", { schema: z.string() });
					properties.exposeProperty(ArrayWithProperty, "property", {
						schema: z.string(),
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
					properties.exposeProperty(MapWithProperty, "testProperty", { schema: z.string() });
					properties.exposeProperty(MapWithProperty, "property", {
						schema: z.string(),
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

	it("handles schema short name collisions by appending a counter", () => {
		// Create two schemas with the same short name but different scopes
		const schemaFactory1 = new SchemaFactory("test");
		const schemaFactory2 = new SchemaFactory("test2");

		class Foo1 extends schemaFactory1.object("Foo", {
			value: schemaFactory1.number,
		}) {}

		class Foo2 extends schemaFactory2.object("Foo", {
			value: schemaFactory2.number,
		}) {}

		class TestObject extends sf.object("Container", {
			item1: Foo1,
			item2: Foo2,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: TestObject }));
		view.initialize({
			item1: { value: 1 },
			item2: { value: 2 },
		});

		const schema = getSimpleSchema(view.schema);
		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);

		assert.ok(schemaText.includes("interface Foo {"), "First collision keeps original name");
		assert.ok(schemaText.includes("interface Foo_2"), "Second collision gets suffix _2");

		assert.ok(
			!schemaText.includes("interface Foo_1"),
			"Suffix _1 should not appear (first keeps original)",
		);
	});

	it("handles mixed colliding and non-colliding schema names", () => {
		// Create schemas where some collide and others don't
		const schemaFactory1 = new SchemaFactory("scope1");
		const schemaFactory2 = new SchemaFactory("scope2");

		class Foo1 extends schemaFactory1.object("Foo", { value: schemaFactory1.number }) {}
		class Foo2 extends schemaFactory2.object("Foo", { value: schemaFactory2.number }) {}
		class Bar extends schemaFactory1.object("Bar", { value: schemaFactory1.number }) {}

		class TestObject extends schemaFactory1.object("Container", {
			fooItem1: Foo1,
			fooItem2: Foo2,
			barItem: Bar,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: TestObject }));
		view.initialize({
			fooItem1: { value: 1 },
			fooItem2: { value: 2 },
			barItem: { value: 3 },
		});

		const schema = getSimpleSchema(view.schema);
		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);

		assert.ok(schemaText.includes("interface Foo {"), "First collision keeps original name");
		assert.ok(schemaText.includes("interface Foo_2"), "Second collision gets suffix _2");
		assert.ok(schemaText.includes("interface Bar"), "Unique name Bar should not have suffix");
	});

	it("distinguishes collision-resolved names from naturally-named schemas", () => {
		// "scope.Foo_1", "scope.Foo", and "scope2.Foo_1" should resolve distinctly
		const sf1 = new SchemaFactory("scope");
		const sf2 = new SchemaFactory("scope2");

		class Foo_1_1 extends sf1.object("Foo_1", { value: sf1.number }) {}
		class Foo extends sf1.object("Foo", { value: sf1.number }) {}
		class Foo_1_2 extends sf2.object("Foo_1", { value: sf2.number }) {}

		class TestObject extends sf.object("Container", {
			item1: Foo_1_1,
			item2: Foo,
			item3: Foo_1_2,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: TestObject }));
		view.initialize({
			item1: { value: 1 },
			item2: { value: 2 },
			item3: { value: 3 },
		});

		const schema = getSimpleSchema(view.schema);
		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);

		assert.ok(schemaText.includes("interface Foo {"), "Unique Foo should not have suffix");

		assert.ok(
			schemaText.includes("interface Foo_1 {"),
			"First Foo_1 collision keeps original name",
		);
		assert.ok(
			schemaText.includes("interface Foo_1_2"),
			"Second Foo_1 collision gets suffix _2",
		);
	});

	it("avoids duplicate names when collision-resolved suffix conflicts with existing schema", () => {
		// Edge case: scope1.foo and scope2.foo collide, but scope3.foo_1 exists
		// This tests that we don't create "foo_1" twice
		const sf1 = new SchemaFactory("scope1");
		const sf2 = new SchemaFactory("scope2");
		const sf3 = new SchemaFactory("scope3");

		class Foo1 extends sf1.object("Foo", { value: sf1.number }) {}
		class Foo2 extends sf2.object("Foo", { value: sf2.number }) {}
		class FooSuffixed extends sf3.object("Foo_1", { value: sf3.number }) {} // Natural "Foo_1"

		class TestObject extends sf.object("Container", {
			item1: Foo1,
			item2: Foo2,
			item3: FooSuffixed,
		}) {}

		const view = independentView(new TreeViewConfiguration({ schema: TestObject }));
		view.initialize({
			item1: { value: 1 },
			item2: { value: 2 },
			item3: { value: 3 },
		});

		const schema = getSimpleSchema(view.schema);
		const { schemaText } = generateEditTypesForPrompt(view.schema, schema);

		// The two "Foo" schemas collide: first keeps original, second gets suffix
		// "Foo_1" is already taken by the natural "Foo_1" but that's a different short name
		const hasFoo = schemaText.includes("interface Foo {");
		const hasFoo_1 = schemaText.includes("interface Foo_1 {");
		const hasFoo_2 = schemaText.includes("interface Foo_2 {");
		const hasFoo_3 = schemaText.includes("interface Foo_3 {");

		assert.ok(hasFoo, "First colliding Foo keeps its original name");
		assert.ok(hasFoo_1, "Natural Foo_1 should exist without modification");
		assert.ok(hasFoo_2, "Second colliding Foo gets suffix _2");
		assert.ok(!hasFoo_3, "Foo_3 should not exist");
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
