/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The test cases below ensure that event types can be successfully imported from core-interfaces and fluid-framework and validate that the imports work as expected.
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import type { Listenable as Listenable_Interfaces } from "@fluidframework/core-interfaces";
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
