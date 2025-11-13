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
import { generateEditTypesForPrompt } from "../typeGeneration.js";
import { unqualifySchema, getZodSchemaAsTypeScript, isNamedSchema } from "../utils.js";

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

interface Obj {
}
`,
			);
		});
	});

	it("includes TypeScript types for node schema", () => {
		const view = independentView(new TreeViewConfiguration({ schema: TestTodoAppSchema }), {});
		view.initialize(initialAppState);

		const schema = getSimpleSchema(view.schema);

		const { domainTypes } = generateEditTypesForPrompt(view.schema, schema);
		for (const [key, value] of Object.entries(domainTypes)) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete domainTypes[key];
			if (isNamedSchema(key)) {
				const friendlyKey = unqualifySchema(key);
				domainTypes[friendlyKey] = value;
			}
		}

		const domainSchemaString = getZodSchemaAsTypeScript(domainTypes);
		assert.notDeepEqual(
			domainSchemaString,
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
});

function getDomainSchemaString<TSchema extends ImplicitFieldSchema>(
	schemaClass: TSchema,
	initialValue: InsertableField<TSchema>,
): string {
	const view = independentView(new TreeViewConfiguration({ schema: schemaClass }), {});
	view.initialize(initialValue);
	const schema = getSimpleSchema(view.schema);
	const { domainTypes } = generateEditTypesForPrompt(view.schema, schema);
	for (const [key, value] of Object.entries(domainTypes)) {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete domainTypes[key];
		if (isNamedSchema(key)) {
			const friendlyKey = unqualifySchema(key);
			domainTypes[friendlyKey] = value;
		}
	}
	return getZodSchemaAsTypeScript(domainTypes);
}
