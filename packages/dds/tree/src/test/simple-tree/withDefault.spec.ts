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
					// eslint-disable-next-line @rushstack/no-new-null
					value: SchemaFactoryAlpha.withDefault(factory.optional(factory.null), null),
				});

				const obj = new TestSchema({});
				// eslint-disable-next-line @rushstack/no-new-null
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

				// Type system doesn't recognize required fields with defaults as optional in constructors
				// Use type assertion to test runtime behavior
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const obj1 = new TestSchema({} as any);
				assert.equal(obj1.count, 42);

				const obj2 = new TestSchema({ count: 100 });
				assert.equal(obj2.count, 100);
			});

			it("string", () => {
				const TestSchema = factory.objectAlpha("TestObject", {
					name: SchemaFactoryAlpha.withDefault(factory.required(factory.string), "default"),
				});

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const obj1 = new TestSchema({ name: undefined } as any);
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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} as any);
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

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const obj1 = new TestSchema({ id: undefined } as any);
				assert.equal(callCount, 1);
				assert.equal(obj1.id, 10);

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const obj2 = new TestSchema({ id: undefined } as any);
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

		it("leaf values are safely reused (not cloned)", () => {
			const TestSchema = factory.objectAlpha("TestObject", {
				name: SchemaFactoryAlpha.withDefault(factory.optional(factory.string), "shared"),
				count: SchemaFactoryAlpha.withDefault(factory.optional(factory.number), 42),
				flag: SchemaFactoryAlpha.withDefault(factory.optional(factory.boolean), true),
			});

			const obj1 = new TestSchema({});
			const obj2 = new TestSchema({});

			// Leaf values are immutable, so they can be safely reused
			assert.equal(obj1.name, "shared");
			assert.equal(obj2.name, "shared");
			assert.equal(obj1.count, 42);
			assert.equal(obj2.count, 42);
			assert.equal(obj1.flag, true);
			assert.equal(obj2.flag, true);

			// Values are primitives, not objects that can be mutated
			assert.equal(typeof obj1.name, "string");
			assert.equal(typeof obj1.count, "number");
			assert.equal(typeof obj1.flag, "boolean");
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
});
