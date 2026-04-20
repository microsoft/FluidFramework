/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The test cases below ensure that type can be successfully imported from all three packages — tree, core-interfaces, and fluid-framework and validate that the imports work as expected.
 * The plan is to remove types {@link @fluidframework/tree#Listenable}, {@link @fluidframework/tree#IsListener}, {@link @fluidframework/tree#Listeners} and {@link @fluidframework/tree#Off}
 * from `@fluidframework/tree` in Fluid Framework 3.0 and instead import them from `fluid-framework` or `@fluidframework/core-interfaces`,
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable as Listenable_Interfaces } from "@fluidframework/core-interfaces";
import type { Listenable as Listenable_Tree } from "@fluidframework/tree";
import type { Listenable as Listenable_Framework } from "fluid-framework";

describe("Test events type imports", () => {
	it("Trigger loaded event using core-interfaces import", async () => {
		const emitter = new MyCompositionClassInterfaces();
		let count = 0;
		emitter.on("loaded", () => {
			count += 1;
		});

		emitter.triggerLoad();
		assert.strictEqual(count, 1);
	});

	it("Trigger loaded event using tree import", async () => {
		const emitter = new MyCompositionClassTree();
		let count = 1;
		emitter.on("loaded", () => {
			count += 1;
		});

		emitter.triggerLoad();
		assert.strictEqual(count, 2);
	});

	it("Trigger loaded event using fluid-framework import", async () => {
		const emitter = new MyCompositionClassFramework();
		let count = 2;
		emitter.on("loaded", () => {
			count += 1;
		});

		emitter.triggerLoad();
		assert.strictEqual(count, 3);
	});
});

/**
 * A set of events with their handlers.
 */
interface MyEvents {
	loaded: () => void;
	computed: () => number;
}

/**
 * Example of composing over {@link CustomEventEmitter}.
 */
export class MyCompositionClassTree implements Listenable_Tree<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load(): number[] {
		this.events.emit("loaded");
		const results: number[] = this.events.emitAndCollect("computed");
		return results;
	}

	public triggerLoad(): void {
		this.load();
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public off<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): void {
		return this.events.off(eventName, listener);
	}
}

/**
 * Example of composing over {@link CustomEventEmitter}.
 */
export class MyCompositionClassFramework implements Listenable_Framework<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load(): number[] {
		this.events.emit("loaded");
		const results: number[] = this.events.emitAndCollect("computed");
		return results;
	}

	public triggerLoad(): void {
		this.load();
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public off<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): void {
		return this.events.off(eventName, listener);
	}
}

/**
 * Example of composing over {@link CustomEventEmitter}.
 */
export class MyCompositionClassInterfaces implements Listenable_Interfaces<MyEvents> {
	private readonly events = createEmitter<MyEvents>();

	private load(): number[] {
		this.events.emit("loaded");
		const results: number[] = this.events.emitAndCollect("computed");
		return results;
	}

	public triggerLoad(): void {
		this.load();
	}

	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
		return this.events.on(eventName, listener);
	}

	public off<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): void {
		return this.events.off(eventName, listener);
	}
}
