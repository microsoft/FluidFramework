/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IFluidHandle, Listenable } from "@fluidframework/core-interfaces";
import type { ILocalFluidHandle } from "@fluidframework/core-interfaces/internal";

import { waitForPayloadUploaded } from "../handles.js";
import {
	type IDisposalEventSource,
	waitForEvent,
	withDisposalAbort,
} from "../waitForEvent.js";

interface TestEvents {
	done: (value: string) => void;
	also: () => void;
	failed: (error: unknown) => void;
}

describe("waitForEvent", () => {
	it("resolves when the resolve event is emitted", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const waitP = waitForEvent(events, "done");
		emitter.emit("done", "value");
		await waitP;
		assert.strictEqual(emitter.hasListeners(), false, "should not leak listeners");
	});

	it("resolves when any of several resolve events is emitted", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const waitP = waitForEvent(events, ["done", "also"]);
		emitter.emit("also");
		await waitP;
		assert.strictEqual(emitter.hasListeners(), false, "should not leak listeners");
	});

	it("rejects with the emitted reason when a rejectOn event is emitted", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const error = new Error("boom");
		const waitP = waitForEvent(events, "done", { rejectOn: ["failed"] });
		emitter.emit("failed", error);
		await assert.rejects(waitP, (actual) => {
			assert.strictEqual(actual, error);
			return true;
		});
		assert.strictEqual(emitter.hasListeners(), false, "should not leak listeners");
	});

	it("resolves rather than rejects when the resolve event wins the race", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const waitP = waitForEvent(events, "done", { rejectOn: ["failed"] });
		emitter.emit("done", "value");
		// A later failure must not affect the already-settled promise.
		emitter.emit("failed", new Error("late failure"));
		await waitP;
	});

	it("rejects with the signal reason when the abort signal aborts while waiting", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const abortController = new AbortController();
		const reason = new Error("aborted");
		const waitP = waitForEvent(events, "done", { abortSignal: abortController.signal });
		abortController.abort(reason);
		await assert.rejects(waitP, (actual) => {
			assert.strictEqual(actual, reason);
			return true;
		});
		assert.strictEqual(emitter.hasListeners(), false, "should not leak listeners");
	});

	it("rejects immediately if the abort signal is already aborted", async () => {
		const emitter = createEmitter<TestEvents>();
		const events: Listenable<TestEvents> = emitter;
		const reason = new Error("already aborted");
		const abortController = new AbortController();
		abortController.abort(reason);
		await assert.rejects(
			waitForEvent(events, "done", { abortSignal: abortController.signal }),
			(actual) => {
				assert.strictEqual(actual, reason);
				return true;
			},
		);
		assert.strictEqual(
			emitter.hasListeners(),
			false,
			"should not subscribe when already aborted",
		);
	});
});

/**
 * Minimal stand-in for a locally-created pending-payload blob handle, exposing just the surface
 * consumed by {@link waitForPayloadUploaded} (see isLocalFluidHandle).
 */
class MockLocalPayloadHandle {
	public payloadState: "pending" | "shared" = "pending";
	public payloadShareError: unknown = undefined;
	public readonly events: Listenable<{
		payloadUploaded: () => void;
		payloadShared: () => void;
		payloadShareFailed: (error: unknown) => void;
	}> & {
		emit(eventName: "payloadUploaded" | "payloadShared"): void;
		emit(eventName: "payloadShareFailed", error: unknown): void;
		hasListeners(): boolean;
	} = createEmitter();
}

describe("waitForPayloadUploaded", () => {
	it("resolves immediately for a non-local handle", async () => {
		// A bare object that is not an ILocalFluidHandle (no payloadState).
		const handle = {} as unknown as IFluidHandle;
		await waitForPayloadUploaded(handle);
	});

	it("resolves immediately when the payload is already shared", async () => {
		const handle = new MockLocalPayloadHandle();
		handle.payloadState = "shared";
		await waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>);
		assert.strictEqual(handle.events.hasListeners(), false, "should not subscribe");
	});

	it("resolves when payloadUploaded fires", async () => {
		const handle = new MockLocalPayloadHandle();
		const waitP = waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>);
		handle.events.emit("payloadUploaded");
		await waitP;
		assert.strictEqual(handle.events.hasListeners(), false, "should not leak listeners");
	});

	it("resolves when payloadShared fires (upload milestone skipped)", async () => {
		const handle = new MockLocalPayloadHandle();
		const waitP = waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>);
		handle.events.emit("payloadShared");
		await waitP;
		assert.strictEqual(handle.events.hasListeners(), false, "should not leak listeners");
	});

	it("rejects when payloadShareFailed fires", async () => {
		const handle = new MockLocalPayloadHandle();
		const error = new Error("upload failed");
		const waitP = waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>);
		handle.events.emit("payloadShareFailed", error);
		await assert.rejects(waitP, (actual) => {
			assert.strictEqual(actual, error);
			return true;
		});
		assert.strictEqual(handle.events.hasListeners(), false, "should not leak listeners");
	});

	it("rejects when aborted (e.g. container disposed) while the upload is pending", async () => {
		const handle = new MockLocalPayloadHandle();
		const abortController = new AbortController();
		const reason = new Error("Container disposed");
		const waitP = waitForPayloadUploaded(
			handle as unknown as ILocalFluidHandle<unknown>,
			abortController.signal,
		);
		abortController.abort(reason);
		await assert.rejects(waitP, (actual) => {
			assert.strictEqual(actual, reason);
			return true;
		});
		assert.strictEqual(handle.events.hasListeners(), false, "should not leak listeners");
	});
});

/**
 * Minimal {@link IDisposalEventSource} stand-in that tracks its "disposed" subscribers, so tests can both
 * fire disposal and assert that the subscription was removed.
 */
class MockDisposalSource implements IDisposalEventSource {
	public disposed = false;
	private readonly listeners = new Set<(...args: unknown[]) => void>();
	public once(_event: "disposed", listener: (...args: unknown[]) => void): void {
		this.listeners.add(listener);
	}
	public off(_event: "disposed", listener: (...args: unknown[]) => void): void {
		this.listeners.delete(listener);
	}
	public dispose(): void {
		this.disposed = true;
		for (const listener of [...this.listeners]) {
			listener();
		}
	}
	public get listenerCount(): number {
		return this.listeners.size;
	}
}

describe("withDisposalAbort", () => {
	it("accepts an IContainer as the disposal source (compile-time check)", () => {
		const asSource = (container: IContainer): IDisposalEventSource => container;
		assert.strictEqual(typeof asSource, "function");
	});

	it("returns the operation result and removes the disposal listener on success", async () => {
		const source = new MockDisposalSource();
		const result = await withDisposalAbort(source, async (signal) => {
			assert.strictEqual(signal.aborted, false);
			return 42;
		});
		assert.strictEqual(result, 42);
		assert.strictEqual(source.listenerCount, 0, "should remove the disposal listener");
	});

	it("removes the disposal listener when the operation rejects", async () => {
		const source = new MockDisposalSource();
		const error = new Error("operation failed");
		await assert.rejects(
			withDisposalAbort(source, async () => {
				throw error;
			}),
			(actual) => {
				assert.strictEqual(actual, error);
				return true;
			},
		);
		assert.strictEqual(source.listenerCount, 0, "should remove the disposal listener");
	});

	it("aborts the operation when the source is disposed", async () => {
		const source = new MockDisposalSource();
		const opP = withDisposalAbort(
			source,
			async (signal) =>
				new Promise<never>((_resolve, reject) => {
					signal.addEventListener("abort", () => {
						// eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- propagate the abort reason as-is
						reject(signal.reason);
					});
				}),
		);
		source.dispose();
		await assert.rejects(opP, /disposed/);
		assert.strictEqual(source.listenerCount, 0, "should remove the disposal listener");
	});

	it("runs with an already-aborted signal if the source is already disposed", async () => {
		const source = new MockDisposalSource();
		source.disposed = true;
		let sawAbort = false;
		await assert.rejects(
			withDisposalAbort(source, async (signal) => {
				sawAbort = signal.aborted;
				throw signal.reason;
			}),
			/disposed/,
		);
		assert.strictEqual(sawAbort, true, "operation should see an already-aborted signal");
		assert.strictEqual(source.listenerCount, 0, "should not subscribe when already disposed");
	});

	it("ties waitForPayloadUploaded to disposal without leaking a listener", async () => {
		const handle = new MockLocalPayloadHandle();
		const source = new MockDisposalSource();
		const waitP = withDisposalAbort(source, async (signal) =>
			waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>, signal),
		);
		source.dispose();
		await assert.rejects(waitP, /disposed/);
		assert.strictEqual(
			handle.events.hasListeners(),
			false,
			"should not leak handle listeners",
		);
		assert.strictEqual(source.listenerCount, 0, "should not leak disposal listeners");
	});

	it("resolves waitForPayloadUploaded and cleans up when upload completes before disposal", async () => {
		const handle = new MockLocalPayloadHandle();
		const source = new MockDisposalSource();
		const waitP = withDisposalAbort(source, async (signal) =>
			waitForPayloadUploaded(handle as unknown as ILocalFluidHandle<unknown>, signal),
		);
		handle.events.emit("payloadUploaded");
		await waitP;
		assert.strictEqual(
			handle.events.hasListeners(),
			false,
			"should not leak handle listeners",
		);
		assert.strictEqual(source.listenerCount, 0, "should remove the disposal listener");
	});
});
