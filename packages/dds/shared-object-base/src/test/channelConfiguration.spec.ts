/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null -- JSON null must be accepted, unlike undefined. */
/* eslint-disable unicorn/no-await-expression-member -- Read one field from each request outcome. */

import { strict as assert } from "node:assert";

import { DataProcessingError, UsageError } from "@fluidframework/telemetry-utils/internal";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";

import {
	ChannelConfigurationController,
	type ChannelConfiguration,
	type ChannelConfigurationChange,
	type ChannelConfigurationControllerOptions,
	type ChannelConfigurationDefinition,
	type ChannelConfigurationAttachedContext,
} from "../channelConfiguration.js";
import {
	parseChannelConfigurationSnapshot,
	hasChannelConfigurationMarker,
	parseChannelConfigurationMessage,
	type ChannelConfigurationMessageV1,
	type ChannelConfigurationValuesV1,
} from "../channelConfigurationFormat.js";

const definition: ChannelConfigurationDefinition<ChannelConfiguration> = {
	defaultConfiguration: {},
	validateTransition: (previous, next): asserts next is ChannelConfiguration => {
		assert(!Object.hasOwn(next, "unsupported"), "Unsupported channel configuration values");
		if (previous !== undefined && next.unsafe === true) {
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
		isAttached: () => true,
		verifyCanChange: () => {},
		submit: (message, metadata) => submitted.push({ message, metadata }),
		...options,
	});
	controller.on("changed", (change) => changes.push(change));
	return { controller, submitted, changes };
}

function context(
	local: boolean = true,
	messageIndex: number = 0,
): ChannelConfigurationAttachedContext {
	return {
		source: "sequenced",
		sequenceNumber: 10,
		clientSequenceNumber: messageIndex + 1,
		messageIndex,
		local,
	};
}

function proposal(
	expectedRevision: number,
	values: ChannelConfigurationValuesV1,
): ChannelConfigurationMessageV1 {
	return { version: 1, isChannelConfigurationOp: true, expectedRevision, values };
}

describe("ChannelConfigurationController", () => {
	it("resolves one winner and one conflict for competing clients at the same revision", async () => {
		const first = harness();
		const second = harness();
		const firstRequest = first.controller.requestChange({ enabled: false });
		const secondRequest = second.controller.requestChange({ enabled: null });
		const firstOp = first.submitted.at(0);
		const secondOp = second.submitted.at(0);
		assert(firstOp !== undefined);
		assert(secondOp !== undefined);
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
		const firstOp = submitted.at(0);
		const secondOp = submitted.at(1);
		assert(firstOp !== undefined);
		assert(secondOp !== undefined);
		assert.notEqual(firstOp.metadata, secondOp.metadata);
		assert.deepEqual(JSON.parse(JSON.stringify(firstOp.message)), {
			version: 1,
			isChannelConfigurationOp: true,
			expectedRevision: 0,
			values: { enabled: false },
		});
		controller.process(secondOp.message, context(), secondOp.metadata);
		controller.process(firstOp.message, context(true, 1), firstOp.metadata);
		assert.equal((await one).status, "conflict");
		assert.equal((await two).status, "applied");
		assert.equal(changes.length, 1);
	});

	it("increments every accepted barrier, including identical, removed, disabled, and repeated values", () => {
		const { controller, changes } = harness();
		const replacements: ChannelConfigurationValuesV1[] = [
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
			const change = changes.at(index);
			assert(change !== undefined);
			assert.equal(change.source, "sequenced");
			assert.equal(change.current, controller.current);
		}
		assert.equal(changes.length, replacements.length);
		const firstChange = changes.at(0);
		assert(firstChange !== undefined);
		assert.equal(firstChange.previous.revision, 0);
	});

	it("does not interpret unsupported obsolete values on a conflict", () => {
		let validations = 0;
		const { controller, changes } = harness({
			definition: {
				defaultConfiguration: {},
				validateTransition: (previous, next): asserts next is ChannelConfiguration => {
					validations++;
					definition.validateTransition(previous, next);
				},
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
			order.push("callback");
		});
		const request = controller.requestChange({});
		const complete = request.then(() => order.push("promise"));
		const sent = submitted.at(0);
		assert(sent !== undefined);
		controller.process(sent.message, context(), sent.metadata);
		assert.deepEqual(order, ["callback"]);
		controller.process(proposal(1, { enabled: false }), context(false, 1));
		const result = await request;
		assert.equal(result.current.revision, 1);
		assert.equal(controller.current.revision, 2);
		await complete;
		assert.deepEqual(order, ["callback", "callback", "promise"]);
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
			const change = changes.at(index);
			assert(change !== undefined);
			assert.equal("sequenceNumber" in change, false);
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
		const sent = submitted.at(0);
		assert(sent !== undefined);
		assert.equal(sent.message.expectedRevision, 1);
		controller.process(sent.message, context(), sent.metadata);
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
				const sent = submitted.at(0);
				assert(sent !== undefined);
				controller.process(sent.message, context(), sent.metadata);
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

	it("treats a failed submission as fatal and rejects all outstanding requests", async () => {
		const failure = new Error("Transport failed");
		let fail = false;
		const sent: { message: ChannelConfigurationMessageV1; metadata: unknown }[] = [];
		const { controller, changes } = harness({
			submit: (message, metadata) => {
				if (fail) {
					throw failure;
				}
				sent.push({ message, metadata });
			},
		});
		const pending = assert.rejects(controller.requestChange({}), (error) => error === failure);
		fail = true;
		const rejected = assert.rejects(
			controller.requestChange({ enabled: false }),
			(error) => error === failure,
		);
		await Promise.all([pending, rejected]);
		assert.equal(controller.current.revision, 0);
		assert.equal(changes.length, 0);
		assert.equal(sent.length, 1);
		fail = false;
		await assert.rejects(controller.requestChange({}), (error) => error === failure);
		assert.equal(sent.length, 1);
	});

	it("rejects submitted requests on disposal and preserves the original close error", async () => {
		const { controller, submitted, changes } = harness();
		const failure = new Error("Runtime closed");
		const pending = [
			assert.rejects(controller.requestChange({}), (error) => error === failure),
			assert.rejects(
				controller.requestChange({ enabled: false }),
				(error) => error === failure,
			),
		];
		controller.dispose(failure);
		controller.dispose(new Error("Later close"));
		await Promise.all(pending);
		await assert.rejects(controller.requestChange({}), (error) => error === failure);
		assert.throws(
			() => controller.process(proposal(0, {}), context(false)),
			(error) => error === failure,
		);
		assert.equal(controller.current.revision, 0);
		assert.equal(changes.length, 0);
		assert.equal(submitted.length, 2);
	});

	it("rejects requests with a default error when disposed without a reason", async () => {
		const { controller } = harness();
		const pending = assert.rejects(controller.requestChange({}), /controller disposed/);
		controller.dispose();
		await pending;
		await assert.rejects(controller.requestChange({}), /controller disposed/);
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
		const original = submitted.at(0);
		assert(original !== undefined);
		controller.process(proposal(0, {}), context(false));
		const current = controller.current;
		controller.reSubmit(original.message, original.metadata);
		const resubmitted = submitted.at(1);
		assert(resubmitted !== undefined);
		assert.equal(resubmitted.message.expectedRevision, 0);
		assert.equal(resubmitted.metadata, original.metadata);
		assert.equal(controller.current, current);
		assert.equal(changes.length, 1);
		controller.applyStashedOp(proposal(0, { unsupported: true }));
		assert.equal(controller.current, current);
		assert.equal(submitted.length, 3);
		const restored = submitted.at(2);
		assert(restored !== undefined);
		assert.deepEqual(restored.message, proposal(0, { unsupported: true }));
		assert.equal(restored.metadata, undefined);
		controller.process(resubmitted.message, context(), resubmitted.metadata);
		assert.equal((await request).status, "conflict");
	});

	it("reconstructs a stashed configuration for acknowledgement without activating it", () => {
		const { controller, submitted, changes } = harness();
		const initial = controller.current;
		const stashed = {
			version: 1,
			isChannelConfigurationOp: true,
			expectedRevision: 0,
			values: {},
		};
		controller.applyStashedOp(stashed);
		assert.equal(submitted.length, 1);
		const restored = submitted.at(0);
		assert(restored !== undefined);
		assert.deepEqual(restored.message, stashed);
		assert.equal(restored.message, stashed);
		assert.equal(restored.metadata, undefined);
		assert.equal(controller.current, initial);
		assert.equal(changes.length, 0);
		controller.process(restored.message, context(), restored.metadata);
		assert.equal(controller.current.revision, 1);
		assert.equal(changes.length, 1);
	});

	it("rolls back only the associated request and clears it from pending bookkeeping", async () => {
		const { controller, submitted } = harness();
		const rolledBack = assert.rejects(controller.requestChange({}), (error: unknown) => {
			assert(error instanceof Error);
			assert(!(error instanceof UsageError));
			assert(!(error instanceof DataProcessingError));
			assert.match(error.message, /rolled back/);
			return true;
		});
		const surviving = controller.requestChange({ enabled: false });
		const rolledBackOp = submitted.at(0);
		assert(rolledBackOp !== undefined);
		controller.rollback(rolledBackOp.metadata);
		controller.rollback(rolledBackOp.metadata);
		await rolledBack;
		assert.equal(controller.current.revision, 0);
		const survivingOp = submitted.at(1);
		assert(survivingOp !== undefined);
		controller.process(survivingOp.message, context(), survivingOp.metadata);
		assert.equal((await surviving).status, "applied");
		controller.dispose();
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
		const sent = submitted.at(0);
		assert(sent !== undefined);
		assert.throws(
			() => controller.process(sent.message, context(), sent.metadata),
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

	it("rejects live requests when validation fails at the current revision", async () => {
		const { controller } = harness();
		const rejected = assert.rejects(controller.requestChange({}), /Unsupported/);
		assert.throws(
			() => controller.process(proposal(0, { unsupported: true }), context(false)),
			/Unsupported/,
		);
		await rejected;
		assert.equal(controller.current.revision, 0);
		await assert.rejects(controller.requestChange({}), /Unsupported/);
	});

	it("rejects a future revision as a fatal processing failure", async () => {
		const { controller, changes } = harness();
		const request = assert.rejects(
			controller.requestChange({}),
			validateAssertionError("Channel configuration proposal has a future revision"),
		);
		assert.throws(
			() => controller.process(proposal(1, {}), context(false)),
			validateAssertionError("Channel configuration proposal has a future revision"),
		);
		await request;
		assert.equal(changes.length, 0);
		assert.equal(controller.current.revision, 0);
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

	it("validates initial configuration without a previous value, then validates transitions", async () => {
		const snapshot = { version: 1, revision: 4, values: { unsafe: true } };
		for (const attached of [false, true]) {
			const validations: [ChannelConfiguration | undefined, ChannelConfiguration][] = [];
			const { controller, submitted, changes } = harness({
				definition: {
					...definition,
					validateTransition: (previous, next): asserts next is ChannelConfiguration => {
						validations.push([previous, next]);
						definition.validateTransition(previous, next);
					},
				},
				snapshot,
				isAttached: () => attached,
			});
			assert.deepEqual(validations, [[undefined, snapshot.values]]);
			assert.equal(controller.current.values, snapshot.values);
			assert.equal(changes.length, 0);

			const replacement = { enabled: false };
			const request = controller.requestChange(replacement);
			assert.deepEqual(validations, [
				[undefined, snapshot.values],
				[snapshot.values, replacement],
			]);
			if (attached) {
				const sent = submitted.at(0);
				assert(sent !== undefined);
				controller.process(sent.message, context(), sent.metadata);
				assert.deepEqual(validations, [
					[undefined, snapshot.values],
					[snapshot.values, replacement],
					[snapshot.values, replacement],
				]);
			}
			assert.equal((await request).status, "applied");
		}
	});

	it("validates initial values", () => {
		assert.throws(
			() => harness({ snapshot: { version: 1, revision: 0, values: { unsupported: true } } }),
			/Unsupported/,
		);
	});
});

describe("channel configuration format", () => {
	it("reads versioned snapshots and configuration messages", () => {
		const input = {
			version: 1,
			revision: 2,
			values: { nested: [{ flag: false }], nullable: null },
		};
		assert.deepEqual(parseChannelConfigurationSnapshot(input), input);
		const message = proposal(0, input.values);
		assert.deepEqual(parseChannelConfigurationMessage(message), message);
	});

	it("accepts additional snapshot fields", () => {
		const input = { version: 1, revision: 0, values: {}, extra: true };
		assert.equal(parseChannelConfigurationSnapshot(input), input);
	});

	it("accepts negative zero revisions in snapshots and configuration ops", () => {
		const input = { version: 1, revision: -0, values: {} };
		assert.equal(parseChannelConfigurationSnapshot(input), input);
		const message = proposal(-0, input.values);
		assert.equal(parseChannelConfigurationMessage(message), message);
	});

	it("recognizes only the reserved top-level key without interpreting ordinary payloads", () => {
		for (const contents of [
			undefined,
			null,
			false,
			5,
			"data",
			[],
			[1, { isChannelConfigurationOp: true }],
			{ kind: "configuration", version: 1, revision: 5, contents: {} },
			{ value: { isChannelConfigurationOp: true } },
		]) {
			assert.equal(hasChannelConfigurationMarker(contents), false);
		}
		assert.equal(hasChannelConfigurationMarker({ isChannelConfigurationOp: false }), true);
	});

	for (const revision of [
		-1,
		0.5,
		Number.NaN,
		Infinity,
		Number.MAX_SAFE_INTEGER + 1,
		"0",
		undefined,
	]) {
		it(`rejects invalid revision ${String(revision)} in snapshots and configuration ops`, () => {
			assert.throws(() =>
				parseChannelConfigurationSnapshot({ version: 1, revision, values: {} }),
			);
			assert.throws(() =>
				parseChannelConfigurationMessage({
					version: 1,
					isChannelConfigurationOp: true,
					expectedRevision: revision,
					values: {},
				}),
			);
		});
	}

	it("rejects unknown versions, missing fields, extra message fields, and invalid markers", () => {
		for (const message of [
			{},
			{ version: 2, isChannelConfigurationOp: true, expectedRevision: 0, values: {} },
			{ version: 1, isChannelConfigurationOp: true, expectedRevision: 0 },
			{
				version: 1,
				isChannelConfigurationOp: true,
				expectedRevision: 0,
				values: {},
				extra: 1,
			},
			{ version: 1, isChannelConfigurationOp: true, expectedRevision: 0, values: [] },
			{ version: 1, isChannelConfigurationOp: true, expectedRevision: 0, values: null },
			{ version: 1, isChannelConfigurationOp: false, expectedRevision: 0, values: {} },
			{ version: 1, expectedRevision: 0, values: {} },
		]) {
			assert.throws(() => parseChannelConfigurationMessage(message));
		}
		for (const snapshot of [
			{ version: 2, revision: 0, values: {} },
			{ version: 1, revision: 0 },
		]) {
			assert.throws(() => parseChannelConfigurationSnapshot(snapshot));
		}
	});
});
