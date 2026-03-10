/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactoryAlpha } from "../../simple-tree/index.js";

describe("withDefault", () => {
	const factory = new SchemaFactoryAlpha("test");

	describe("optional fields", () => {
		describe("primitive types with static defaults", () => {
			it("number", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					count: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), 0),
				});

				const obj1 = new TestSchema({});
				assert.equal(obj1.count, 0);

				const obj2 = new TestSchema({ count: 42 });
				assert.equal(obj2.count, 42);

				const obj3 = new TestSchema({ count: undefined });
				assert.equal(obj3.count, 0);
			});

			it("string", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					name: SchemaFactoryAlpha.withDefault(factory.optional(factory.string), "untitled"),
				});

				const obj1 = new TestSchema({});
				assert.equal(obj1.name, "untitled");

				const obj2 = new TestSchema({ name: "custom" });
				assert.equal(obj2.name, "custom");

				const obj3 = new TestSchema({ name: undefined });
				assert.equal(obj3.name, "untitled");
			});

			it("boolean", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					enabled: SchemaFactoryAlpha.withDefault(factory.optional(factory.boolean), false),
				});

				const obj1 = new TestSchema({});
				assert.equal(obj1.enabled, false);

				const obj2 = new TestSchema({ enabled: true });
				assert.equal(obj2.enabled, true);

				const obj3 = new TestSchema({ enabled: undefined });
				assert.equal(obj3.enabled, false);
			});

			it("null", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					value: SchemaFactoryAlpha.withDefault(factory.optional(factory.null), null),
				});

				const obj = new TestSchema({});
				assert.equal(obj.value, null);
			});

			it("multiple fields", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					count: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), 0),
					enabled: SchemaFactoryAlpha.withDefault(factory.optional(factory.boolean), false),
					name: SchemaFactoryAlpha.withDefault(factory.optional(factory.string), "untitled"),
				});

				const obj = new TestSchema({});
				assert.equal(obj.count, 0);
				assert.equal(obj.enabled, false);
				assert.equal(obj.name, "untitled");
			});
		});

		describe("dynamic defaults", () => {
			it("factory function called each time", () => {
				let callCount = 0;
				const TestSchema = factory.objectAlpha("TestObject", {
					value: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), () => {
						callCount++;
						return callCount * 100;
					}),
				});

				const obj1 = new TestSchema({});
				assert.equal(callCount, 1);
				assert.equal(obj1.value, 100);

				const obj2 = new TestSchema({});
				assert.equal(callCount, 2);
				assert.equal(obj2.value, 200);
			});

			it("explicit value overrides default", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					timestamp: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), () =>
						Date.now(),
					),
				});

				const explicitTimestamp = 12345;
				const obj = new TestSchema({ timestamp: explicitTimestamp });
				assert.equal(obj.timestamp, explicitTimestamp);
			});

			it("generator functions for different primitive types", () => {
				let counter = 0;
				const TestSchema = factory.objectAlpha("TestObject", {
					// String generator
					id: SchemaFactoryAlpha.withDefault(
						factory.optional(factory.string),
						() => `id-${counter++}`,
					),
					// Number generator with Math
					random: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), () =>
						Math.random(),
					),
					// Boolean generator
					flag: SchemaFactoryAlpha.withDefault(
						factory.optional(factory.boolean),
						() => counter % 2 === 0,
					),
				});

				const obj1 = new TestSchema({});
				assert.equal(obj1.id, "id-0");
				assert.equal(typeof obj1.random, "number");
				assert.equal(obj1.flag, false); // counter was 1 after first increment

				const obj2 = new TestSchema({});
				assert.equal(obj2.id, "id-1");
				assert.equal(typeof obj2.random, "number");
				assert.equal(obj2.flag, true); // counter was 2 after second increment, 2 % 2 === 0

				// Each object gets different random values
				assert.notEqual(obj1.random, obj2.random);
			});
		});

		describe("custom node types", () => {
			it("nested object with function default", () => {
				const NestedSchema = factory.objectAlpha("Nested", {
					x: factory.number,
					y: factory.number,
				});

				const TestSchema = factory.objectAlpha("TestObject", {
					position: SchemaFactoryAlpha.withDefault(
						factory.optional(NestedSchema),
						() => new NestedSchema({ x: 0, y: 0 }),
					),
				});

				const obj1 = new TestSchema({});
				// Verify the default was applied at construction time
				assert(obj1.position !== undefined);
				assert.equal(obj1.position.x, 0);
				assert.equal(obj1.position.y, 0);

				const obj2 = new TestSchema({ position: new NestedSchema({ x: 10, y: 20 }) });
				assert(obj2.position !== undefined);
				assert.equal(obj2.position.x, 10);
				assert.equal(obj2.position.y, 20);
			});

			it("array with function default", () => {
				const ArraySchema = factory.arrayAlpha("NumberArray", factory.number);

				const TestSchema = factory.objectAlpha("TestObject", {
					numbers: SchemaFactoryAlpha.withDefault(
						factory.optional(ArraySchema),
						() => new ArraySchema([]),
					),
				});

				const obj1 = new TestSchema({});
				assert(obj1.numbers !== undefined);
				assert.equal(obj1.numbers.length, 0);

				const obj2 = new TestSchema({ numbers: new ArraySchema([1, 2, 3]) });
				assert(obj2.numbers !== undefined);
				assert.equal(obj2.numbers.length, 3);
				assert.equal(obj2.numbers[0], 1);
			});

			it("nested object with dynamic default", () => {
				const NestedSchema = factory.objectAlpha("Nested", {
					id: factory.number,
				});

				let nextId = 1;
				const TestSchema = factory.objectAlpha("TestObject", {
					item: SchemaFactoryAlpha.withDefault(factory.optional(NestedSchema), () => {
						return new NestedSchema({ id: nextId++ });
					}),
				});

				const obj1 = new TestSchema({});
				assert(obj1.item !== undefined);
				assert.equal(obj1.item.id, 1);

				const obj2 = new TestSchema({});
				assert(obj2.item !== undefined);
				assert.equal(obj2.item.id, 2);
			});
		});
	});

	describe("required fields", () => {
		describe("primitive types with static defaults", () => {
			it("number", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					count: SchemaFactoryAlpha.withDefault(factory.required(factory.number), 42),
				});

				const obj1 = new TestSchema({});
				assert.equal(obj1.count, 42);

				const obj2 = new TestSchema({ count: 100 });
				assert.equal(obj2.count, 100);
			});

			it("string", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					name: SchemaFactoryAlpha.withDefault(factory.required(factory.string), "default"),
				});

				const obj1 = new TestSchema({ name: undefined });
				assert.equal(obj1.name, "default");

				const obj2 = new TestSchema({ name: "custom" });
				assert.equal(obj2.name, "custom");
			});

			it("multiple fields", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					x: SchemaFactoryAlpha.withDefault(factory.required(factory.number), 0),
					y: SchemaFactoryAlpha.withDefault(factory.required(factory.number), 0),
					label: SchemaFactoryAlpha.withDefault(factory.required(factory.string), "point"),
				});

				const obj = new TestSchema({
					x: undefined,
					y: undefined,
					label: undefined,
				});
				assert.equal(obj.x, 0);
				assert.equal(obj.y, 0);
				assert.equal(obj.label, "point");
			});
		});

		describe("dynamic defaults", () => {
			it("factory function called each time", () => {
				let callCount = 0;
				const TestSchema = factory.objectAlpha("TestObject", {
					id: SchemaFactoryAlpha.withDefault(factory.required(factory.number), () => {
						callCount++;
						return callCount * 10;
					}),
				});

				const obj1 = new TestSchema({ id: undefined });
				assert.equal(callCount, 1);
				assert.equal(obj1.id, 10);

				const obj2 = new TestSchema({ id: undefined });
				assert.equal(callCount, 2);
				assert.equal(obj2.id, 20);

				// Can still provide explicit value
				const obj3 = new TestSchema({ id: 999 });
				assert.equal(callCount, 2); // Default function not called
				assert.equal(obj3.id, 999);
			});
		});
	});

	describe("cloning behavior", () => {
		it("generator function returning same instance is cloned for each use", () => {
			const NestedSchema = factory.objectAlpha("Nested", {
				count: factory.number,
			});

			// Create a single shared instance that the generator returns repeatedly
			const sharedInstance = new NestedSchema({ count: 50 });

			const TestSchema = factory.objectAlpha("TestObject", {
				// Even though the function returns the same instance, it should be cloned
				nested: SchemaFactoryAlpha.withDefault(
					factory.optional(NestedSchema),
					() => sharedInstance,
				),
			});

			const obj1 = new TestSchema({});
			const obj2 = new TestSchema({});

			// Each object should get a cloned instance, not the shared one
			assert(obj1.nested !== undefined);
			assert(obj2.nested !== undefined);
			assert(obj1.nested !== obj2.nested, "Each use should get a cloned instance");
			assert(obj1.nested !== sharedInstance, "Should not be the shared instance");
			assert(obj2.nested !== sharedInstance, "Should not be the shared instance");

			// Modifying one should not affect the other or the original
			obj1.nested.count = 75;
			assert.equal(obj1.nested.count, 75);
			assert.equal(obj2.nested.count, 50);
			assert.equal(sharedInstance.count, 50, "Original instance should be unchanged");
		});

		it("generator function returning same array is cloned for each use", () => {
			const ArraySchema = factory.arrayAlpha("NumberArray", factory.number);

			// Create a single array that the generator returns repeatedly
			const sharedArray = new ArraySchema([1, 2, 3]);

			const TestSchema = factory.objectAlpha("TestObject", {
				numbers: SchemaFactoryAlpha.withDefault(
					factory.optional(ArraySchema),
					() => sharedArray,
				),
			});

			const obj1 = new TestSchema({});
			const obj2 = new TestSchema({});

			// Each object should get a cloned array, not the shared one
			assert(obj1.numbers !== undefined);
			assert(obj2.numbers !== undefined);
			assert(obj1.numbers !== obj2.numbers, "Each use should get a cloned array");
			assert(obj1.numbers !== sharedArray, "Should not be the shared array");

			// Modifying one should not affect the other or the original
			obj1.numbers.insertAtEnd(4);
			assert.equal(obj1.numbers.length, 4);
			assert.equal(obj2.numbers.length, 3, "Modifying obj1 array should not affect obj2");
			assert.equal(sharedArray.length, 3, "Original array should be unchanged");
		});
	});

	describe("type validation", () => {
		it("value default must match field's allowed types", () => {
			const PersonSchema = factory.objectAlpha("Person", {
				name: factory.string,
				age: factory.number,
			});

			// Valid: number default for number field
			const TestSchema1 = factory.objectAlpha("Test1", {
				count: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), 42),
			});
			const obj1 = new TestSchema1({});
			assert.equal(obj1.count, 42);

			// Valid: string default for string field
			const TestSchema2 = factory.objectAlpha("Test2", {
				name: SchemaFactoryAlpha.withDefault(factory.optional(factory.string), "default"),
			});
			const obj2 = new TestSchema2({});
			assert.equal(obj2.name, "default");

			// Valid: object default for object field
			const TestSchema3 = factory.objectAlpha("Test3", {
				person: SchemaFactoryAlpha.withDefault(
					factory.optional(PersonSchema),
					new PersonSchema({ name: "Alice", age: 30 }),
				),
			});
			const obj3 = new TestSchema3({});
			assert.equal(obj3.person?.name, "Alice");

			// @ts-expect-error Type mismatch: string default for number field
			SchemaFactoryAlpha.withDefault(factory.optional(factory.number), "string");
			// @ts-expect-error Type mismatch: number default for object field
			SchemaFactoryAlpha.withDefault(factory.optional(PersonSchema), 42);
		});

		it("generator function return type must match field's allowed types", () => {
			const PersonSchema = factory.objectAlpha("Person", {
				name: factory.string,
				age: factory.number,
			});

			// Valid: generator returns number for number field
			const TestSchema1 = factory.objectAlpha("Test1", {
				count: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), () => 42),
			});
			const obj1 = new TestSchema1({});
			assert.equal(obj1.count, 42);

			// Valid: generator returns string for string field
			const TestSchema2 = factory.objectAlpha("Test2", {
				id: SchemaFactoryAlpha.withDefault(
					factory.optional(factory.string),
					() => `id-${Math.random()}`,
				),
			});
			const obj2 = new TestSchema2({});
			assert(obj2.id !== undefined);
			assert(obj2.id.startsWith("id-"));

			// Valid: generator returns object for object field
			const TestSchema3 = factory.objectAlpha("Test3", {
				person: SchemaFactoryAlpha.withDefault(
					factory.optional(PersonSchema),
					() => new PersonSchema({ name: "Bob", age: 25 }),
				),
			});
			const obj3 = new TestSchema3({});
			assert.equal(obj3.person?.name, "Bob");

			// @ts-expect-error Type mismatch: generator returns string for number field
			SchemaFactoryAlpha.withDefault(factory.optional(factory.number), () => "string");
			// @ts-expect-error Type mismatch: generator returns number for object field
			SchemaFactoryAlpha.withDefault(factory.optional(PersonSchema), () => 42);
		});

		it("works with union types", () => {
			const Cat = factory.objectAlpha("Cat", {
				meow: factory.string,
			});

			const Dog = factory.objectAlpha("Dog", {
				bark: factory.string,
			});

			// Field allows either Cat or Dog
			const TestSchema = factory.objectAlpha("Test", {
				pet: SchemaFactoryAlpha.withDefault(
					factory.optional([Cat, Dog]),
					new Cat({ meow: "default meow" }),
				),
			});

			const obj = new TestSchema({});
			assert(obj.pet !== undefined);
			// The default is a Cat, so we can access the meow property
			assert.equal((obj.pet as { meow: string }).meow, "default meow");
		});
	});

	describe("instance method", () => {
		it("can use instance withDefault method", () => {
			const TestSchema = factory.objectAlpha("TestObject", {
				name: factory.withDefault(factory.optional(factory.string), "default"),
			});

			const obj = new TestSchema({});
			assert.equal(obj.name, "default");
		});
	});

	it("withDefault with undefined as the default value", () => {
		const TestSchema = factory.objectAlpha("TestObject", {
			name: SchemaFactoryAlpha.withDefault(factory.optional(factory.string), undefined),
		});

		const obj1 = new TestSchema({});
		assert.equal(obj1.name, undefined);

		const obj2 = new TestSchema({ name: "hello" });
		assert.equal(obj2.name, "hello");
	});

	describe("withDefaultRecursive", () => {
		describe("optionalRecursive with static default", () => {
			it("number", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptNumber", {
					count: SchemaFactoryAlpha.withDefaultRecursive(factory.optional(factory.number), 0),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.count, 0);

				const node2 = new RecursiveNode({ count: 42 });
				assert.equal(node2.count, 42);

				const node3 = new RecursiveNode({ count: undefined });
				assert.equal(node3.count, 0);
			});

			it("string", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptString", {
					label: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.string),
						"default-label",
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.label, "default-label");

				const node2 = new RecursiveNode({ label: "custom" });
				assert.equal(node2.label, "custom");

				const node3 = new RecursiveNode({ label: undefined });
				assert.equal(node3.label, "default-label");
			});

			it("boolean", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptBoolean", {
					enabled: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.boolean),
						false,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.enabled, false);

				const node2 = new RecursiveNode({ enabled: true });
				assert.equal(node2.enabled, true);

				const node3 = new RecursiveNode({ enabled: undefined });
				assert.equal(node3.enabled, false);
			});

			it("null", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptNull", {
					value: SchemaFactoryAlpha.withDefaultRecursive(factory.optional(factory.null), null),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({});
				assert.equal(node.value, null);
			});

			it("multiple fields", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptMultiple", {
					count: SchemaFactoryAlpha.withDefaultRecursive(factory.optional(factory.number), 0),
					label: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.string),
						"untitled",
					),
					enabled: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.boolean),
						false,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({});
				assert.equal(node.count, 0);
				assert.equal(node.label, "untitled");
				assert.equal(node.enabled, false);
			});

			it("node type", () => {
				// Use a non-recursive node as the default to avoid infinite recursion.
				const Metadata = factory.objectAlpha("OptMetadata", { version: factory.number });

				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeOptNode", {
					meta: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(Metadata),
						() => new Metadata({ version: 1 }),
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert(node1.meta !== undefined);
				assert.equal(node1.meta.version, 1);

				const node2 = new RecursiveNode({ meta: new Metadata({ version: 42 }) });
				assert.equal(node2.meta?.version, 42);

				const node3 = new RecursiveNode({ meta: undefined });
				assert(node3.meta !== undefined);
				assert.equal(node3.meta.version, 1);
			});
		});

		describe("optionalRecursive with generator function default", () => {
			it("generator is called each time a default is needed", () => {
				let callCount = 0;

				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeGenerator", {
					value: factory.number,
					score: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.number),
						() => {
							callCount++;
							return callCount * 10;
						},
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({ value: 0 });
				assert.equal(callCount, 1);
				assert.equal(node1.score, 10);

				const node2 = new RecursiveNode({ value: 0 });
				assert.equal(callCount, 2);
				assert.equal(node2.score, 20);
			});

			it("explicit value skips the generator", () => {
				let callCount = 0;

				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeGeneratorSkip", {
					value: factory.number,
					score: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optional(factory.number),
						() => {
							callCount++;
							return 999;
						},
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({ value: 1, score: 42 });
				assert.equal(callCount, 0);
				assert.equal(node.score, 42);
			});
		});

		describe("requiredRecursive with default", () => {
			it("number", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqNumber", {
					count: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.number]),
						0,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.count, 0);

				const node2 = new RecursiveNode({ count: 42 });
				assert.equal(node2.count, 42);

				const node3 = new RecursiveNode({ count: undefined });
				assert.equal(node3.count, 0);
			});

			it("string", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqString", {
					label: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.string]),
						"default-label",
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.label, "default-label");

				const node2 = new RecursiveNode({ label: "custom" });
				assert.equal(node2.label, "custom");

				const node3 = new RecursiveNode({ label: undefined });
				assert.equal(node3.label, "default-label");
			});

			it("boolean", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqBoolean", {
					enabled: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.boolean]),
						false,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert.equal(node1.enabled, false);

				const node2 = new RecursiveNode({ enabled: true });
				assert.equal(node2.enabled, true);

				const node3 = new RecursiveNode({ enabled: undefined });
				assert.equal(node3.enabled, false);
			});

			it("null", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqNull", {
					value: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.null]),
						null,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({});
				assert.equal(node.value, null);
			});

			it("multiple fields", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqMultiple", {
					count: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.number]),
						0,
					),
					label: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.string]),
						"untitled",
					),
					enabled: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([factory.boolean]),
						false,
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({});
				assert.equal(node.count, 0);
				assert.equal(node.label, "untitled");
				assert.equal(node.enabled, false);
			});

			it("node type", () => {
				// Use a non-recursive node as the default to avoid infinite recursion.
				const Metadata = factory.objectAlpha("ReqMetadata", { version: factory.number });

				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeReqNode", {
					meta: SchemaFactoryAlpha.withDefaultRecursive(
						factory.requiredRecursive([Metadata]),
						() => new Metadata({ version: 1 }),
					),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node1 = new RecursiveNode({});
				assert(node1.meta !== undefined);
				assert.equal(node1.meta.version, 1);

				const node2 = new RecursiveNode({ meta: new Metadata({ version: 42 }) });
				assert.equal(node2.meta.version, 42);

				const node3 = new RecursiveNode({ meta: undefined });
				assert(node3.meta !== undefined);
				assert.equal(node3.meta.version, 1);
			});
		});

		describe("cloning behavior", () => {
			it("generator returning the same recursive instance is cloned for each use", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeClone", {
					count: factory.number,
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const sharedChild = new RecursiveNode({ count: 42, child: undefined });

				class Wrapper extends factory.objectAlpha("WrapperClone", {
					node: SchemaFactoryAlpha.withDefaultRecursive(
						factory.optionalRecursive([() => RecursiveNode]),
						() => sharedChild,
					),
				}) {}

				const obj1 = new Wrapper({});
				const obj2 = new Wrapper({});

				assert(obj1.node !== undefined);
				assert(obj2.node !== undefined);
				assert(obj1.node !== obj2.node, "Each use should get a cloned instance");
				assert(obj1.node !== sharedChild, "Should not be the shared instance");
				assert(obj2.node !== sharedChild, "Should not be the shared instance");

				obj1.node.count = 99;
				assert.equal(obj1.node.count, 99);
				assert.equal(obj2.node.count, 42);
				assert.equal(sharedChild.count, 42, "Original instance should be unchanged");
			});
		});

		describe("instance method", () => {
			it("can use instance withDefaultRecursive method", () => {
				class RecursiveNode extends factory.objectRecursiveAlpha("RecursiveNodeInstance", {
					value: factory.number,
					label: factory.withDefaultRecursive(factory.optional(factory.string), "default"),
					child: factory.optionalRecursive([() => RecursiveNode]),
				}) {}

				const node = new RecursiveNode({ value: 7 });
				assert.equal(node.value, 7);
				assert.equal(node.label, "default");
			});
		});
	});
});
