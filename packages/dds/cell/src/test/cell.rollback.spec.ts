/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { setupRollbackTest, createAdditionalClient } from "@fluid-private/test-dds-utils";

import { CellFactory } from "../cellFactory.js";
import type { ISharedCell } from "../interfaces.js";

const cellFactory = new CellFactory();

describe("Cell with rollback", () => {
	it("should emit valueChanged on set and rollback should re-emit previous value", async () => {
		const { dds: cell, containerRuntime } = setupRollbackTest<ISharedCell>(
			"cell-1",
			(rt, id): ISharedCell => cellFactory.create(rt, id),
		);

		const events: (string | undefined)[] = [];

		cell.on("valueChanged", (value) => events.push("valueChanged"));

		cell.set(10);
		assert.equal(cell.get(), 10);

		containerRuntime.rollback?.();

		assert.equal(cell.get(), undefined);

		assert.deepEqual(events, ["valueChanged"]);
	});

	it("should emit delete on delete, and rollback should re-emit last valueChanged", async () => {
		const {
			dds: cell,
			containerRuntimeFactory,
			containerRuntime,
		} = setupRollbackTest<ISharedCell>(
			"cell-1",
			(rt, id): ISharedCell => cellFactory.create(rt, id),
		);

		const events: (string | undefined)[] = [];

		cell.on("valueChanged", (value) => events.push("valueChanged"));
		cell.on("delete", () => events.push("delete"));

		cell.set(42);
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();

		cell.delete();
		assert(cell.empty());

		// rollback delete
		containerRuntime.rollback?.();
		assert.equal(cell.get(), 42);

		// delete triggers delete event, rollback restores valueChanged
		assert.deepEqual(events, ["valueChanged", "delete", "valueChanged"]);
	});
});

describe("SharedCell rollback events with multiple clients", () => {
	it("should emit valueChanged on set and rollback should re-emit previous value across clients", async () => {
		// Setup two clients
		const {
			dds: cell1,
			containerRuntimeFactory,
			containerRuntime: runtime1,
		} = setupRollbackTest<ISharedCell>(
			"client-1",
			(rt, id): ISharedCell => cellFactory.create(rt, id),
		);
		const { dds: cell2 } = createAdditionalClient(
			containerRuntimeFactory,
			"client-2",
			(rt, id): ISharedCell => cellFactory.create(rt, `cell-${id}`),
		);

		const events1: string[] = [];
		const events2: string[] = [];

		// Listen to valueChanged events on both clients
		cell1.on("valueChanged", () => events1.push("valueChanged"));
		cell2.on("valueChanged", () => events2.push("valueChanged"));

		// Client 1 sets a value
		cell1.set(10);
		assert.equal(cell1.get(), 10);

		// Propagate ops to client 2
		runtime1.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(cell2.get(), 10);

		cell1.set(100);
		assert.equal(cell1.get(), 100);
		assert.equal(cell2.get(), 10);

		// Rollback on client 1
		runtime1.rollback?.();

		assert.equal(cell1.get(), 10);
		assert.equal(cell2.get(), 10);

		// Both clients should have seen the events
		assert.deepEqual(events1, ["valueChanged", "valueChanged", "valueChanged"]);
		assert.deepEqual(events2, ["valueChanged"]);
	});

	it("should emit delete on delete, and rollback should re-emit last valueChanged across clients", async () => {
		// Setup two clients
		const {
			dds: cell1,
			containerRuntimeFactory,
			containerRuntime: runtime1,
		} = setupRollbackTest<ISharedCell>(
			"client-1",
			(rt, id): ISharedCell => cellFactory.create(rt, id),
		);
		const { dds: cell2 } = createAdditionalClient(
			containerRuntimeFactory,
			"client-2",
			(rt, id): ISharedCell => cellFactory.create(rt, `cell-${id}`),
		);

		const events1: string[] = [];
		const events2: string[] = [];

		// Attach listeners
		cell1.on("valueChanged", () => events1.push("valueChanged"));
		cell1.on("delete", () => events1.push("delete"));

		cell2.on("valueChanged", () => events2.push("valueChanged"));
		cell2.on("delete", () => events2.push("delete"));

		// Set initial value and propagate
		cell1.set(42);
		runtime1.flush();
		containerRuntimeFactory.processAllMessages();

		assert.equal(cell2.get(), 42);

		// Delete the value
		cell1.delete();

		assert(cell1.empty());
		assert.equal(cell2.get(), 42);

		// Rollback delete
		runtime1.rollback?.();

		// After rollback, value is restored
		assert.equal(cell1.get(), 42);
		assert.equal(cell2.get(), 42);

		// Event order
		assert.deepEqual(events1, ["valueChanged", "delete", "valueChanged"]);
		assert.deepEqual(events2, ["valueChanged"]);
	});
});
