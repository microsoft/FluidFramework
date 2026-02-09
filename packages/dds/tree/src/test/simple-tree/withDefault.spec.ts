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
		});

		describe("custom node types", () => {
			it("nested object with static default", () => {
				const NestedSchema = factory.objectAlpha("Nested", {
					x: factory.number,
					y: factory.number,
				});

				const TestSchema = factory.objectAlpha("TestObject", {
					position: SchemaFactoryAlpha.withDefault(
						factory.optional(NestedSchema),
						new NestedSchema({ x: 0, y: 0 }),
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

			it("array with static default", () => {
				const ArraySchema = factory.arrayAlpha("NumberArray", factory.number);

				const TestSchema = factory.objectAlpha("TestObject", {
					numbers: SchemaFactoryAlpha.withDefault(
						factory.optional(ArraySchema),
						new ArraySchema([]),
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
				// Use type assertion to test runtime behavior when undefined is explicitly passed
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const obj1 = new TestSchema({ count: undefined } as any);
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
