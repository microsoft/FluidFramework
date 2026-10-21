/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TreeAlpha } from "../shared-tree/index.js";
import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
} from "../simple-tree/index.js";
import { startEphemeralService } from "@fluidframework/local-driver/internal";
import { defineTreeDataStore } from "../treeDataStore.js";

describe("counter example", () => {
	it("existing APIs", () => {
		/**
		 * Schema factory these tests.
		 */
		const sf = new SchemaFactory("test");

		/**
		 * A atomic shared counter.
		 */
		class Counter extends sf.array("Counter", SchemaFactory.number) {
			/**
			 * Add a value to the counter.
			 */
			public add(value: number): void {
				// Would be nice if we could supply a custom undo fallback for this, though I suppose that could be done at the app layer by just having the app hold onto a command instead of revertible.
				this.push(value);
				// Would be cool if we could call normalize here, nesting it in a transaction which is marked "optional"
				// so if it failed it would not fail an outer one.
				this.normalize();
			}

			/**
			 * Get the current value of the counter.
			 */
			public getValue(): number {
				return this.reduce((total, value) => total + value, 0);
			}

			/**
			 * Optimize the counter's internal representation.
			 * @remarks
			 * This should be done in its own transaction to ensure consistency since we don't have a way to make it not fail any outer transaction if it is rejected.
			 *
			 * This can break the ability to undo individual additions to the counter, causing those undo operations to no-op (or fail?).
			 */
			public normalize(): void {
				// This transaction API is missing some options that should be exposed to it, see https://github.com/microsoft/FluidFramework/pull/28477 (including preconditionsOnRevert).
				TreeAlpha.context(this).runTransaction(() => {
					const total = this.getValue();
					// This depends on the merge behavior that this transaction will be rejected if any of these removed nodes do not exist.
					// There isn't a way to refer to these nodes as they are leaves: so if a constraint is needed that might be a problem.
					this.removeRange(0, this.length);
					// And that the inverse of this transaction will be rejected if this total node does not exist.
					// There isn't a way to refer to this node as its a leaf: so if a constraint is needed that might be a problem.
					this.push(total);
					// Kinda creepy we can return this, but get no type checking for it.
					return { preconditionsOnRevert: "Oh No, this really isn't safe at all" };
				});
			}
		}
		it("counter", () => {
			const counter = new Counter();
			assert.equal(counter.getValue(), 0);
			counter.add(5);
			assert.equal(counter.getValue(), 5);
			counter.add(3);
			assert.equal(counter.getValue(), 8);
			counter.normalize();
			assert.equal(counter.getValue(), 8);
		});
	});

	it("Counter Field Kind", () => {
		/**
		 * Schema factory these tests.
		 */
		const sf = new SchemaFactoryAlpha("test");

		/**
		 * A atomic shared counter.
		 */
		class HasCounter extends sf.object("HasCounter", {
			requiredExampleComplex: SchemaFactoryAlpha.withDefault(
				SchemaFactoryAlpha.required(SchemaFactory.number, { key: "example1" }),
				0,
			),

			requiredExampleSimple: SchemaFactoryAlpha.required(SchemaFactory.number),

			counterExampleComplex: SchemaFactoryAlpha.withDefault(
				SchemaFactoryAlpha.counter(SchemaFactory.number, { key: "example2" }),
				0,
			),

			counterExampleSimple: SchemaFactoryAlpha.counter(SchemaFactory.number),
		}) {}
		it("counter", async () => {
			const hasCounter = new HasCounter({
				requiredExampleSimple: 100,
				counterExampleSimple: 200,
			});
			assert.equal(hasCounter.counterExampleSimple.value, 200);
			assert.equal(hasCounter.counterExampleSimple.add(2), 202);

			assert.equal(hasCounter.counterExampleComplex.value, 0);
			assert.equal(hasCounter.counterExampleComplex.add(-5), -5);

			const myFactory = defineTreeDataStore({
				type: "my-tree",
				config: new TreeViewConfiguration({ schema: HasCounter }),
				initializer: () => hasCounter,
			});

			const client = startEphemeralService().defaultClient;
			const attached = await client.createAttachedContainer(myFactory);

			const other = await client.loadContainer(attached.id, myFactory);

			const otherHasCounter = other.data.root;

			assert.equal(hasCounter.counterExampleSimple.add(3), 205);
			assert.equal(otherHasCounter.counterExampleSimple.add(5), 208);

			await client.service.synchronize();

			assert.equal(hasCounter.counterExampleSimple.value, 210);
			assert.equal(otherHasCounter.counterExampleSimple.value, 210);

			// TODO: test undo functionality for the counter.
		});
	});
});
