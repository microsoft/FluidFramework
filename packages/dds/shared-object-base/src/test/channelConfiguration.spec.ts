/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null -- JSON null must be accepted, unlike undefined. */
/* eslint-disable unicorn/no-await-expression-member -- Read one field from each request outcome. */

import { strict as assert } from "node:assert";

import {
	ChannelConfigurationController,
	type ChannelConfiguration,
	type ChannelConfigurationChange,
	type ChannelConfigurationControllerOptions,
	type ChannelConfigurationDefinition,
	type ChannelConfigurationSequencedContext,
} from "../channelConfiguration.js";
import {
	copyChannelConfiguration,
	copyChannelConfigurationSnapshot,
	parseConfiguredChannelMessage,
	type ChannelConfigurationMessageV1,
} from "../channelConfigurationFormat.js";

const definition: ChannelConfigurationDefinition<ChannelConfiguration> = {
	isSupported: (values): values is ChannelConfiguration =>
		!Object.hasOwn(values, "unsupported"),
	validateTransition: (_previous, next) => {
		if (next.unsafe === true) {
			throw new Error("Unsafe transition");
		}
	},
};

function harness(
	options: Partial<ChannelConfigurationControllerOptions<ChannelConfiguration>> = {},
): {
	controller: ChannelConfigurationController<ChannelConfiguration>;
	submitted: { message: ChannelConfigurationMessageV1; metadata: unknown }[];
	changes: ChannelConfigurationChange<ChannelConfiguration>[];
} {
	const submitted: { message: ChannelConfigurationMessageV1; metadata: unknown }[] = [];
	const changes: ChannelConfigurationChange<ChannelConfiguration>[] = [];
	const controller = new ChannelConfigurationController({
		definition,
		snapshot: { version: 1, revision: 0, values: { enabled: true } },
		source: "load",
		isAttached: () => true,
		verifyCanChange: () => {},
		submit: (message, metadata) => submitted.push({ message, metadata }),
		maxMessageSize: () => 1024 * 1024,
		...options,
	});
	controller.on("changed", (change) => changes.push(change));
	return { controller, submitted, changes };
}

function context(
	local: boolean = true,
	messageIndex: number = 0,
): ChannelConfigurationSequencedContext {
	return {
		source: "sequenced",
		sequenceNumber: 10,
		clientSequenceNumber: messageIndex + 1,
		messageIndex,
		local,
	};
}

function proposal(expectedRevision: number, values: unknown): unknown {
	return { version: 1, kind: "configuration", expectedRevision, values };
}

function at<T>(values: readonly T[], index: number = 0): T {
	const value = values[index];
	assert(value !== undefined);
	return value;
}

describe("ChannelConfigurationController", () => {
	it("resolves one winner and one conflict for competing clients at the same revision", async () => {
		const first = harness();
		const second = harness();
		const firstRequest = first.controller.requestChange({ enabled: false });
		const secondRequest = second.controller.requestChange({ enabled: null });
		const firstOp = at(first.submitted);
		const secondOp = at(second.submitted);
		assert.equal(firstOp.message.expectedRevision, secondOp.message.expectedRevision);
		assert.equal(first.controller.current.revision, 0);
		assert.equal(second.controller.current.revision, 0);

		first.controller.process(firstOp.message, context(), firstOp.metadata);
		second.controller.process(firstOp.message, context(false));
		first.controller.process(secondOp.message, context(false, 1));
		second.controller.process(secondOp.message, context(true, 1), secondOp.metadata);

		const winner = await firstRequest;
		const loser = await secondRequest;
		assert.equal(winner.status, "applied");
		assert.equal(loser.status, "conflict");
		assert.equal(winner.source, "sequenced");
		assert.equal(loser.source, "sequenced");
		assert.deepEqual(first.controller.current, second.controller.current);
		assert.equal(first.changes.length, 1);
		assert.equal(second.changes.length, 1);
		assert.equal(winner.current.revision, 1);
		assert.deepEqual(loser.current.values, { enabled: false });
	});

	it("tracks multiple live requests by opaque local metadata without optimistic changes", async () => {
		const { controller, submitted, changes } = harness();
		const previous = controller.current;
		const one = controller.requestChange({ enabled: false });
		const two = controller.requestChange({});
		assert.equal(controller.current, previous);
		assert.equal(changes.length, 0);
		assert.notEqual(at(submitted).metadata, at(submitted, 1).metadata);
		assert.deepEqual(JSON.parse(JSON.stringify(at(submitted).message)), {
			version: 1,
			kind: "configuration",
			expectedRevision: 0,
			values: { enabled: false },
		});
		controller.process(at(submitted, 1).message, context(), at(submitted, 1).metadata);
		controller.process(at(submitted).message, context(true, 1), at(submitted).metadata);
		assert.equal((await one).status, "conflict");
		assert.equal((await two).status, "applied");
		assert.equal(changes.length, 1);
	});

	it("copies values and captures the expected revision before returning", async () => {
		const { controller, submitted } = harness();
		const input = { nested: [{ enabled: true }] };
		const request = controller.requestChange(input);
		at(input.nested).enabled = false;
		controller.process(proposal(0, { other: true }), context(false));
		assert.equal(at(submitted).message.expectedRevision, 0);
		assert.deepEqual(at(submitted).message.values, { nested: [{ enabled: true }] });
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.equal((await request).status, "conflict");
	});

	it("increments every accepted barrier, including identical, removed, disabled, and repeated values", () => {
		const { controller, changes } = harness();
		const replacements = [
			{ enabled: true },
			{ enabled: false },
			{},
			{ enabled: null },
			{ enabled: true },
		];
		for (const [index, values] of replacements.entries()) {
			controller.process(proposal(index, values), context(false, index));
			assert.equal(controller.current.revision, index + 1);
			assert.deepEqual(controller.current.values, values);
			assert.equal(at(changes, index).source, "sequenced");
			assert.equal(at(changes, index).current, controller.current);
		}
		assert.equal(changes.length, replacements.length);
		assert.equal(at(changes).previous.revision, 0);
	});

	it("does not interpret unsupported obsolete values on a conflict", () => {
		let validations = 0;
		const { controller, changes } = harness({
			definition: {
				isSupported: (values): values is ChannelConfiguration => {
					validations++;
					return !Object.hasOwn(values, "unsupported");
				},
				validateTransition: () => {},
			},
		});
		controller.process(proposal(0, {}), context(false));
		const before = validations;
		const result = controller.process(proposal(0, { unsupported: true }), context(false, 1));
		assert.equal(result.status, "conflict");
		assert.equal(validations, before);
		assert.equal(changes.length, 1);
	});

	it("updates the getter and notifies synchronously before request completion", async () => {
		const { controller, submitted } = harness();
		const order: string[] = [];
		controller.on("changed", (change) => {
			assert.equal(controller.current, change.current);
			assert.equal(change.previous.revision, order.length);
			assert.equal(change.current.revision, order.length + 1);
			assert.equal(Object.isFrozen(change), true);
			order.push("callback");
		});
		const request = controller.requestChange({});
		const complete = request.then(() => order.push("promise"));
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.deepEqual(order, ["callback"]);
		controller.process(proposal(1, { enabled: false }), context(false, 1));
		const result = await request;
		assert.equal(result.current.revision, 1);
		assert.equal(controller.current.revision, 2);
		await complete;
		assert.deepEqual(order, ["callback", "callback", "promise"]);
	});

	it("supports synchronous on/off notifications without an initial event", () => {
		const { controller, changes } = harness();
		let calls = 0;
		const listener = (): void => {
			calls++;
		};
		controller.on("changed", listener);
		assert.equal(changes.length, 0);
		controller.process(proposal(0, {}), context(false));
		controller.off("changed", listener);
		controller.process(proposal(1, {}), context(false, 1));
		assert.equal(calls, 1);
		assert.equal(changes.length, 2);
	});

	it("applies repeated detached changes immediately without submit or service sequence fields", async () => {
		const { controller, submitted, changes } = harness({ isAttached: () => false });
		const first = controller.requestChange({ enabled: false });
		assert.deepEqual(controller.current.values, { enabled: false });
		assert.equal(controller.current.revision, 1);
		assert.equal(changes.length, 1);
		const second = controller.requestChange({});
		const third = controller.requestChange({});
		assert.equal(controller.current.revision, 3);
		assert.equal(changes.length, 3);
		assert.equal(submitted.length, 0);
		for (const [index, request] of [first, second, third].entries()) {
			const result = await request;
			assert.equal(result.source, "local");
			assert.equal(result.status, "applied");
			assert.equal(result.current.revision, index + 1);
			assert.equal("sequenceNumber" in result, false);
			assert.equal("messageIndex" in result, false);
			assert.equal("sequenceNumber" in at(changes, index), false);
		}
	});

	it("uses attachment rather than connection state to choose authority", async () => {
		let attached = false;
		const { controller, submitted, changes } = harness({ isAttached: () => attached });
		assert.equal((await controller.requestChange({})).source, "local");
		attached = true;
		const next = controller.requestChange({ enabled: false });
		assert.equal(controller.current.revision, 1);
		assert.equal(changes.length, 1);
		assert.equal(at(submitted).message.expectedRevision, 1);
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.equal((await next).source, "sequenced");
		assert.equal(controller.current.revision, 2);
	});

	it("rejects local validation without submitting and permits a subsequent valid request", async () => {
		for (const attached of [true, false]) {
			const { controller, submitted } = harness({ isAttached: () => attached });
			await assert.rejects(controller.requestChange({ unsupported: true }), /Unsupported/);
			await assert.rejects(controller.requestChange({ unsafe: true }), /Unsafe transition/);
			assert.equal(controller.current.revision, 0);
			assert.equal(submitted.length, 0);
			const valid = controller.requestChange({});
			if (attached) {
				controller.process(at(submitted).message, context(), at(submitted).metadata);
			}
			assert.equal((await valid).status, "applied");
		}
	});

	it("enforces the injected lifecycle guard for both attached and unattached changes", async () => {
		for (const attached of [true, false]) {
			const { controller, submitted } = harness({
				isAttached: () => attached,
				verifyCanChange: () => {
					throw new Error("Read-only or prohibited phase");
				},
			});
			await assert.rejects(controller.requestChange({}), /Read-only/);
			assert.equal(submitted.length, 0);
			controller.process(proposal(0, {}), context(false));
			assert.equal(controller.current.revision, 1);
		}
	});

	it("prohibits reentrant requests and ordinary submission during callbacks", async () => {
		const { controller } = harness({ isAttached: () => false });
		let nested: Promise<unknown> | undefined;
		controller.on("changed", () => {
			nested = assert.rejects(controller.requestChange({}), /configuration callback/);
			assert.throws(() => controller.verifyCanSubmit(), /configuration callback/);
		});
		await controller.requestChange({});
		await nested;
		assert.equal(controller.current.revision, 1);
	});

	it("resubmits and restores original expected revisions without activation or retagging", async () => {
		const { controller, submitted, changes } = harness();
		const request = controller.requestChange({ enabled: false });
		const original = at(submitted);
		controller.process(proposal(0, {}), context(false));
		const current = controller.current;
		controller.reSubmit(original.message, original.metadata);
		assert.equal(at(submitted, 1).message.expectedRevision, 0);
		assert.equal(at(submitted, 1).metadata, original.metadata);
		assert.equal(controller.current, current);
		assert.equal(changes.length, 1);
		controller.applyStashedOp(proposal(0, { unsupported: true }));
		assert.equal(controller.current, current);
		assert.equal(submitted.length, 3);
		assert.deepEqual(at(submitted, 2).message, proposal(0, { unsupported: true }));
		assert.equal(at(submitted, 2).metadata, undefined);
		controller.process(at(submitted, 1).message, context(), at(submitted, 1).metadata);
		assert.equal((await request).status, "conflict");
	});

	it("reconstructs a stashed configuration for acknowledgement without activating it", () => {
		const { controller, submitted, changes } = harness();
		const initial = controller.current;
		const stashed = { version: 1, kind: "configuration", expectedRevision: 0, values: {} };
		controller.applyStashedOp(stashed);
		assert.equal(submitted.length, 1);
		const restored = at(submitted);
		assert.deepEqual(restored.message, stashed);
		assert.notEqual(restored.message, stashed);
		assert.equal(restored.metadata, undefined);
		assert.equal(controller.current, initial);
		assert.equal(changes.length, 0);
		controller.process(restored.message, context(), restored.metadata);
		assert.equal(controller.current.revision, 1);
		assert.equal(changes.length, 1);
	});

	it("rolls back only the associated request and clears it from pending bookkeeping", async () => {
		const { controller, submitted } = harness();
		const rolledBack = assert.rejects(controller.requestChange({}), /rolled back/);
		const surviving = controller.requestChange({ enabled: false });
		controller.rollback(at(submitted).metadata);
		controller.rollback(at(submitted).metadata);
		await rolledBack;
		assert.equal(controller.current.revision, 0);
		controller.process(at(submitted, 1).message, context(), at(submitted, 1).metadata);
		assert.equal((await surviving).status, "applied");
		controller.dispose();
	});

	it("rejects outstanding requests on disposal and prevents later changes", async () => {
		const { controller } = harness();
		const failure = new Error("Closed runtime");
		const first = assert.rejects(controller.requestChange({}), (error) => error === failure);
		const second = assert.rejects(
			controller.requestChange({ enabled: false }),
			(error) => error === failure,
		);
		controller.dispose(failure);
		controller.dispose(new Error("Second close"));
		await Promise.all([first, second]);
		await assert.rejects(controller.requestChange({}), (error) => error === failure);
		assert.throws(
			() => controller.process(proposal(0, {}), context(false)),
			(error) => error === failure,
		);
	});

	it("rejects all pending promises when an accepted barrier callback fails", async () => {
		const { controller, submitted } = harness();
		const failure = new Error("Callback failed");
		const first = assert.rejects(controller.requestChange({}), (error) => error === failure);
		const second = assert.rejects(
			controller.requestChange({ enabled: false }),
			(error) => error === failure,
		);
		controller.on("changed", () => {
			throw failure;
		});
		assert.throws(
			() => controller.process(at(submitted).message, context(), at(submitted).metadata),
			(error) => error === failure,
		);
		await Promise.all([first, second]);
		await assert.rejects(controller.requestChange({}), (error) => error === failure);
	});

	it("treats local callback failure as fatal rather than rolling back and continuing", async () => {
		const { controller, submitted } = harness({ isAttached: () => false });
		controller.on("changed", () => {
			throw new Error("Local callback failed");
		});
		await assert.rejects(controller.requestChange({}), /Local callback failed/);
		assert.equal(controller.current.revision, 1);
		await assert.rejects(
			controller.requestChange({ enabled: false }),
			/Local callback failed/,
		);
		assert.equal(submitted.length, 0);
	});

	for (const [name, values] of [
		["unsupported", { unsupported: true }],
		["invalid transition", { unsafe: true }],
		["invalid JSON", { invalid: undefined }],
	] as const) {
		it(`fails receiving ${name} at the current revision and rejects live requests`, async () => {
			const { controller } = harness();
			const rejected = assert.rejects(controller.requestChange({}));
			assert.throws(() => controller.process(proposal(0, values), context(false)));
			await rejected;
			assert.equal(controller.current.revision, 0);
			await assert.rejects(controller.requestChange({}));
		});
	}

	it("rejects a future revision as a fatal processing failure", async () => {
		const { controller, changes } = harness();
		const request = assert.rejects(controller.requestChange({}), /future revision/);
		assert.throws(
			() => controller.process(proposal(1, {}), context(false)),
			/future revision/,
		);
		await request;
		assert.equal(changes.length, 0);
		assert.equal(controller.current.revision, 0);
	});

	it("rejects a restored future revision when sequenced replay reaches it", () => {
		const { controller, submitted, changes } = harness({
			snapshot: { version: 1, revision: 4, values: {} },
			maxMessageSize: () => undefined,
		});
		controller.applyStashedOp(proposal(5, {}));
		const restored = at(submitted);
		assert.equal(restored.message.expectedRevision, 5);
		assert.throws(
			() => controller.process(restored.message, context(), restored.metadata),
			/future revision/,
		);
		assert.equal(controller.current.revision, 4);
		assert.equal(changes.length, 0);
	});

	it("rejects revision overflow on requests and incoming barriers, but permits old conflicts", async () => {
		const snapshot = { version: 1, revision: Number.MAX_SAFE_INTEGER, values: {} };
		const { controller, submitted } = harness({ snapshot });
		await assert.rejects(controller.requestChange({}), /overflow/);
		assert.equal(submitted.length, 0);
		assert.equal(
			controller.process(proposal(Number.MAX_SAFE_INTEGER - 1, {}), context(false)).status,
			"conflict",
		);
		assert.throws(
			() => controller.process(proposal(Number.MAX_SAFE_INTEGER, {}), context(false)),
			/overflow/,
		);
		assert.equal(controller.current.revision, Number.MAX_SAFE_INTEGER);
	});

	it("rejects a failed submission without leaking or cancelling other pending requests", async () => {
		let fail = false;
		const submitted: { message: ChannelConfigurationMessageV1; metadata: unknown }[] = [];
		const { controller } = harness({
			submit: (message, metadata) => {
				if (fail) {
					throw new Error("Submit failed");
				}
				submitted.push({ message, metadata });
			},
		});
		const first = controller.requestChange({});
		fail = true;
		await assert.rejects(controller.requestChange({ enabled: false }), /Submit failed/);
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.equal((await first).status, "applied");
		controller.dispose();
	});

	it("handles synchronous delivery by a submit callback without losing completion metadata", async () => {
		const { controller } = harness({
			submit: (message, metadata) => controller.process(message, context(), metadata),
		});
		assert.equal((await controller.requestChange({})).status, "applied");
		assert.equal(controller.current.revision, 1);
	});

	it("enforces UTF-8 message size including the configuration envelope", async () => {
		let limit = 1024;
		const { controller, submitted } = harness({ maxMessageSize: () => limit });
		const next = { unicode: "🌊".repeat(30) };
		const encodedSize = new TextEncoder().encode(JSON.stringify(proposal(0, next))).byteLength;
		limit = encodedSize - 1;
		await assert.rejects(controller.requestChange(next), /message size/);
		assert.equal(submitted.length, 0);
		limit = encodedSize;
		const accepted = controller.requestChange(next);
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.equal((await accepted).status, "applied");
	});

	it("loads persisted snapshots independently of attachment state and submission limits", () => {
		const snapshot = { version: 1, revision: 4, values: { text: "a".repeat(1024) } };
		for (const limit of [0, undefined, 64]) {
			for (const attached of [false, true]) {
				let reads = 0;
				const { controller, changes } = harness({
					snapshot,
					isAttached: () => attached,
					maxMessageSize: () => {
						reads++;
						return limit;
					},
				});
				assert.deepEqual(controller.current, snapshot);
				assert.equal(Object.isFrozen(controller.current.values), true);
				assert.equal(changes.length, 0);
				assert.equal(reads, 0);
			}
		}
	});

	it("applies sequenced barriers identically despite unavailable or smaller submission limits", () => {
		const values = { text: "a".repeat(1024) };
		for (const limit of [0, undefined, 64]) {
			let reads = 0;
			const { controller, changes } = harness({
				maxMessageSize: () => {
					reads++;
					return limit;
				},
			});
			controller.process(proposal(0, values), context(false));
			controller.process(proposal(1, values), context(false, 1));
			assert.deepEqual(controller.current, { version: 1, revision: 2, values });
			assert.equal(changes.length, 2);
			assert.equal(reads, 0);
		}
	});

	it("captures obsolete stashed intent unchanged without consulting submission limits", () => {
		const message = proposal(0, { unsupported: "a".repeat(1024) });
		for (const limit of [0, undefined, 64]) {
			let reads = 0;
			const { controller, submitted, changes } = harness({
				snapshot: { version: 1, revision: 2, values: {} },
				maxMessageSize: () => {
					reads++;
					return limit;
				},
			});
			const snapshot = controller.current;
			controller.applyStashedOp(message);
			const restored = at(submitted);
			assert.deepEqual(restored.message, message);
			assert.equal(restored.metadata, undefined);
			assert.equal(controller.current, snapshot);
			const result = controller.process(restored.message, context(), restored.metadata);
			assert.equal(result.status, "conflict");
			assert.equal(result.current, snapshot);
			assert.equal(changes.length, 0);
			assert.equal(reads, 0);
		}
	});

	it("still validates live resubmission against the current runtime limit", async () => {
		for (const unavailableOrSmallerLimit of [0, undefined, 64]) {
			let limit: number | undefined = 1024 * 1024;
			const { controller, submitted } = harness({ maxMessageSize: () => limit });
			const request = controller.requestChange({ text: "a".repeat(1024) });
			const original = at(submitted);
			limit = unavailableOrSmallerLimit;
			const rejected = assert.rejects(request, /size/);
			assert.throws(() => controller.reSubmit(original.message, original.metadata), /size/);
			await rejected;
			assert.equal(controller.current.revision, 0);
			assert.equal(submitted.length, 1);
		}
	});

	it("allows detached changes with an unknown limit but still bounds their serialized size", async () => {
		for (const limit of [0, undefined]) {
			const { controller, submitted, changes } = harness({
				isAttached: () => false,
				maxMessageSize: () => limit,
			});
			const first = controller.requestChange({});
			assert.equal(controller.current.revision, 1);
			assert.equal(changes.length, 1);
			assert.equal((await first).source, "local");
			const overhead = new TextEncoder().encode(
				JSON.stringify(proposal(1, { text: "" })),
			).byteLength;
			const maximum = { text: "a".repeat(16 * 1024 - overhead) };
			await assert.rejects(
				controller.requestChange({ text: `${maximum.text}a` }),
				/message size/,
			);
			const accepted = controller.requestChange(maximum);
			assert.equal(controller.current.revision, 2);
			assert.equal((await accepted).source, "local");
			assert.equal(submitted.length, 0);
		}
	});

	it("does not carry the detached fallback into attached submissions", async () => {
		let attached = false;
		let limit = 0;
		const { controller, submitted } = harness({
			isAttached: () => attached,
			maxMessageSize: () => limit,
		});
		await controller.requestChange({});
		attached = true;
		await assert.rejects(controller.requestChange({}), /size limit/);
		assert.equal(controller.current.revision, 1);
		assert.equal(submitted.length, 0);
		limit = 1024;
		const accepted = controller.requestChange({});
		controller.process(at(submitted).message, context(), at(submitted).metadata);
		assert.equal((await accepted).source, "sequenced");
	});

	it("validates initial values and rejects invalid or unknown live submission limits", async () => {
		assert.throws(
			() => harness({ snapshot: { version: 1, revision: 0, values: { unsupported: true } } }),
			/Unsupported/,
		);
		assert.throws(
			() => harness({ source: "create", isAttached: () => false, maxMessageSize: () => 1 }),
			/message size/,
		);
		for (const limit of [0, undefined, -1, Number.NaN, Infinity, 1.5]) {
			const { controller } = harness({ maxMessageSize: () => limit });
			await assert.rejects(controller.requestChange({}), /size limit/);
		}
		for (const limit of [-1, Number.NaN, Infinity, 1.5]) {
			assert.throws(
				() =>
					harness({ source: "create", isAttached: () => false, maxMessageSize: () => limit }),
				/size limit/,
			);
		}
	});
});

describe("channel configuration format", () => {
	it("copies and deeply freezes snapshots and values independently of input ownership", () => {
		const input = {
			version: 1,
			revision: 2,
			values: { nested: [{ flag: false }], nullable: null },
		};
		const copy = copyChannelConfigurationSnapshot(input);
		at(input.values.nested).flag = true;
		input.revision = 3;
		assert.deepEqual(copy, {
			version: 1,
			revision: 2,
			values: { nested: [{ flag: false }], nullable: null },
		});
		assert.equal(Object.isFrozen(copy), true);
		assert.equal(Object.isFrozen(copy.values), true);
		assert.equal(Object.isFrozen(copy.values.nested), true);
		assert.equal(Reflect.set(copy, "revision", 5), false);
		assert.equal(Reflect.set(copy.values, "nullable", true), false);
		const nested = copy.values.nested;
		assert(Array.isArray(nested));
		assert.equal(Object.isFrozen(at(nested)), true);
		assert.equal(Reflect.set(at(nested), "flag", true), false);
	});

	it("allows repeated references without cycles and safe JSON keys without prototype mutation", () => {
		const repeated = { flag: true };
		const values = Object.create(null) as Record<string, unknown>;
		values.first = repeated;
		values.second = repeated;
		values.__proto__ = { safe: true };
		const copy = copyChannelConfiguration(values);
		assert.deepEqual(copy.first, copy.second);
		assert.notEqual(copy.first, repeated);
		assert.equal(Object.getPrototypeOf(copy), Object.prototype);
		assert.deepEqual(Object.getOwnPropertyDescriptor(copy, "__proto__")?.value, {
			safe: true,
		});
		assert.equal(Object.hasOwn(copy, "safe"), false);
	});

	const invalidValues: readonly [string, () => unknown][] = [
		["undefined", () => ({ value: undefined })],
		["NaN", () => ({ value: Number.NaN })],
		["Infinity", () => ({ value: Infinity })],
		["negative Infinity", () => ({ value: -Infinity })],
		["negative zero", () => ({ value: -0 })],
		["nested negative zero", () => ({ values: [{ value: -0 }] })],
		["symbol values", () => ({ value: Symbol("value") })],
		["symbol keys", () => ({ [Symbol("key")]: true })],
		["functions", () => ({ value: () => {} })],
		["bigints", () => ({ value: 1n })],
		[
			"sparse arrays",
			() => {
				const value: unknown[] = [];
				value.length = 3;
				return { value };
			},
		],
		["arrays with undefined elements", () => ({ value: [undefined] })],
		["arrays with custom properties", () => ({ value: Object.assign([], { custom: true }) })],
		[
			"custom array prototypes",
			() => {
				const value: unknown[] = [];
				Object.setPrototypeOf(value, null);
				return { value };
			},
		],
		["dates", () => ({ value: new Date(0) })],
		["custom prototypes", () => ({ value: Object.create({ inherited: true }) as unknown })],
		["serialized handles", () => ({ value: { type: "__fluid_handle__", url: "/data" } })],
		[
			"nested serialized handles",
			() => ({ value: [{ nested: { type: "__fluid_handle__" } }] }),
		],
		["nonenumerable properties", () => Object.defineProperty({}, "hidden", { value: true })],
		[
			"object cycles",
			() => {
				const value: Record<string, unknown> = {};
				value.self = value;
				return value;
			},
		],
		[
			"array cycles",
			() => {
				const value: unknown[] = [];
				value.push(value);
				return { value };
			},
		],
		["top-level arrays", () => []],
		["top-level null", () => null],
		["top-level strings", () => "value"],
	];
	for (const [name, create] of invalidValues) {
		it(`rejects ${name} in copying and both local authority modes`, async () => {
			const value = create();
			assert.throws(() => copyChannelConfiguration(value));
			for (const attached of [true, false]) {
				const { controller, submitted, changes } = harness({ isAttached: () => attached });
				await assert.rejects(controller.requestChange(value as ChannelConfiguration));
				assert.equal(controller.current.revision, 0);
				assert.equal(submitted.length, 0);
				assert.equal(changes.length, 0);
			}
		});
	}

	it("rejects accessors and toJSON without executing application code", () => {
		let calls = 0;
		const getter = (): boolean => {
			calls++;
			return true;
		};
		const record = Object.defineProperty({}, "flag", { get: getter, enumerable: true });
		const array = Object.defineProperty([false], "0", { get: getter, enumerable: true });
		const serializable = {
			toJSON: () => {
				calls++;
				return {};
			},
		};
		for (const value of [record, { array }, serializable]) {
			assert.throws(() => copyChannelConfiguration(value));
		}
		assert.throws(() =>
			parseConfiguredChannelMessage(Object.defineProperty({}, "version", { get: getter })),
		);
		assert.equal(calls, 0);
	});

	it("validates message envelopes but leaves ordinary contents to the DDS serializer", () => {
		const contents = { unsupported: undefined };
		const parsed = parseConfiguredChannelMessage({
			version: 1,
			kind: "operation",
			revision: 0,
			contents,
		});
		assert.equal(parsed.kind, "operation");
		if (parsed.kind === "operation") {
			assert.equal(parsed.contents, contents);
		}
		assert.equal(Object.isFrozen(parsed), true);
	});

	it("rejects negative zero in persisted and sequenced values instead of serializing it as zero", () => {
		const values = { value: -0 };
		assert.equal(JSON.stringify(values), '{"value":0}');
		assert.throws(() => copyChannelConfigurationSnapshot({ version: 1, revision: 0, values }));
		const { controller, changes } = harness();
		assert.throws(() => controller.process(proposal(0, values), context(false)), /non-JSON/);
		assert.equal(controller.current.revision, 0);
		assert.equal(changes.length, 0);
		assert.deepEqual(copyChannelConfiguration({ value: 0 }), { value: 0 });
	});

	for (const revision of [
		-1,
		-0,
		0.5,
		Number.NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		"0",
		undefined,
	]) {
		it(`rejects invalid revision ${String(revision)} in snapshots and both envelope kinds`, () => {
			assert.throws(() =>
				copyChannelConfigurationSnapshot({ version: 1, revision, values: {} }),
			);
			assert.throws(() =>
				parseConfiguredChannelMessage({
					version: 1,
					kind: "configuration",
					expectedRevision: revision,
					values: {},
				}),
			);
			assert.throws(() =>
				parseConfiguredChannelMessage({
					version: 1,
					kind: "operation",
					revision,
					contents: {},
				}),
			);
		});
	}

	it("rejects unknown versions, missing fields, extra fields, and invalid kinds", () => {
		for (const message of [
			{},
			{ version: 2, kind: "configuration", expectedRevision: 0, values: {} },
			{ version: 1, kind: "configuration", expectedRevision: 0 },
			{ version: 1, kind: "configuration", expectedRevision: 0, values: {}, extra: 1 },
			{ version: 1, kind: "configuration", expectedRevision: 0, values: [] },
			{ version: 1, kind: "configuration", expectedRevision: 0, values: null },
			{ version: 1, kind: "operation", revision: 0 },
			{ version: 1, kind: "unknown", revision: 0, contents: {} },
		]) {
			assert.throws(() => parseConfiguredChannelMessage(message));
		}
		for (const snapshot of [
			{ version: 2, revision: 0, values: {} },
			{ version: 1, revision: 0 },
			{ version: 1, revision: 0, values: {}, extra: true },
		]) {
			assert.throws(() => copyChannelConfigurationSnapshot(snapshot));
		}
	});
});
