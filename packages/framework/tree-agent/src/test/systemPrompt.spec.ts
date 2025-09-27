/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import type { ImplicitFieldSchema } from "@fluidframework/tree";
import {
	asAlpha,
	getSimpleSchema,
	SchemaFactory,
	SharedTree,
	TreeViewConfiguration,
} from "@fluidframework/tree/internal";
// eslint-disable-next-line import/no-internal-modules
import { FakeListChatModel } from "langchain/embeddings/fake";
import { z } from "zod";

import { createSemanticAgent, type FunctioningSemanticAgent } from "../agent.js";
import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../methodBinding.js";
import { generateEditTypesForPrompt } from "../typeGeneration.js";
import { unqualifySchema, getZodSchemaAsTypeScript, isNamedSchema } from "../utils.js";

const factory = SharedTree.getFactory();
const sf = new SchemaFactory("test");

class Todo extends sf.object("Todo", {
	title: sf.string,
	completed: sf.boolean,
}) {
	public M2(n: string): boolean {
		return false;
	}

	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(Todo, "M2", buildFunc({ returns: z.boolean() }, ["n", z.string()]));
	}
}

class TestTodoAppSchema extends sf.object("TestTodoAppSchema", {
	title: sf.string,
	description: sf.string,
	todos: sf.array(Todo),
}) {
	public M1(n: number): boolean {
		return false;
	}

	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(
			TestTodoAppSchema,
			"M1",
			buildFunc({ returns: z.boolean() }, ["num", z.number()]),
		);

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

describe("System prompt", () => {
	const getDomainSchemaString = <TSchema extends ImplicitFieldSchema>(
		schemaClass: TSchema,
		initialValue: unknown,
	): string => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: schemaClass }));
		view.initialize(initialValue as never);
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
	};

	it("doesNodeContainArraySchema should return true if the node contains an array schema property", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: TestTodoAppSchema }));
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
		assert.notDeepEqual(domainSchemaString, "");
	});

	it("helper methods being present shows up in the system prompt", () => {
		class ArrayWithMethod extends sf.array("Todo", sf.string) {
			public M2(n: string): boolean {
				return false;
			}

			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					ArrayWithMethod,
					"M2",
					buildFunc({ returns: z.boolean() }, ["n", z.string()]),
				);
			}
		}

		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(new TreeViewConfiguration({ schema: ArrayWithMethod }));
		view.initialize([]);
		const chat = new FakeListChatModel({
			responses: ["pong", "second", "third"],
		});

		const agent = createSemanticAgent(chat, asAlpha(view)) as FunctioningSemanticAgent<
			typeof ArrayWithMethod
		>;

		assert.equal(
			agent.systemPrompt.includes("ALWAYS prefer to use the application helper methods"),
			true,
		);
	});

	it("method binding works on array nodes", () => {
		class ArrayWithMethod extends sf.array("Todo", sf.string) {
			public M2(n: string): boolean {
				return false;
			}

			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					ArrayWithMethod,
					"M2",
					buildFunc({ returns: z.boolean() }, ["n", z.string()]),
				);
			}
		}

		const arrayDomainSchemaString = getDomainSchemaString(ArrayWithMethod, ["test"]);
		assert.deepEqual(
			arrayDomainSchemaString,
			`// Note: this array has custom user-defined methods directly on it.
type Todo = string[] & {
    M2(n: string): boolean;
};
`,
		);
	});

	it("method binding works on map nodes", () => {
		class MapWithMethod extends sf.map("Todo", sf.string) {
			public M2(n: string): boolean {
				return false;
			}

			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					MapWithMethod,
					"M2",
					buildFunc({ returns: z.boolean() }, ["n", z.string()]),
				);
			}
		}

		const mapDomainSchemaString = getDomainSchemaString(MapWithMethod, new Map());
		assert.deepEqual(
			mapDomainSchemaString,
			`// Note: this map has custom user-defined methods directly on it.
type Todo = Map<string, string> & {
    M2(n: string): boolean;
};
`,
		);
	});

	it("method binding works on for node return types", () => {
		class Obj extends sf.object("Obj", {}) {}

		class MapWithMethod extends sf.map("Todo", sf.string) {
			public M2(n: string): Obj {
				return new Obj({});
			}

			public static [exposeMethodsSymbol](methods: ExposedMethods): void {
				methods.expose(
					MapWithMethod,
					"M2",
					buildFunc({ returns: methods.instanceOf(Obj) }, ["n", z.string()]),
				);
			}
		}

		const mapDomainSchemaString = getDomainSchemaString(MapWithMethod, new Map());
		assert.deepEqual(
			mapDomainSchemaString,
			`// Note: this map has custom user-defined methods directly on it.
type Todo = Map<string, string> & {
    M2(n: string): Obj;
};

interface Obj {
}
`,
		);
	});
});
