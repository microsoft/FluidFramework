/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IContainer,
	IContainerEvents,
} from "@fluidframework/container-definitions/internal";
import { Deferred } from "@fluidframework/core-utils/internal";
import { MessageType } from "@fluidframework/driver-definitions/internal";
import { GenericError } from "@fluidframework/telemetry-utils/internal";
import { createSandbox, type SinonSpy } from "sinon";

import {
	loadSummarizerContainerAndMakeSummary,
	loadSummarizerContainerAndMakeAcknowledgedSummary,
	type ILoadSummarizerContainerProps,
} from "../createAndLoadContainerUtils.js";
import { Loader } from "../loader.js";
import type { SummarizeOnDemandResults } from "../summarizerResultTypes.js";

import { failProxy } from "./failProxy.js";

describe("On-demand summary acknowledgement", () => {
	const sandbox = createSandbox();
	const props: ILoadSummarizerContainerProps = {
		codeLoader: failProxy(),
		urlResolver: failProxy(),
		documentServiceFactory: failProxy(),
		request: { url: "test" },
	};
	type Ack = SummarizeOnDemandResults["receivedSummaryAckOrNack"];

	function ack(version: string): Ack {
		const summaryAckOp: Extract<Ack, { success: true }>["data"]["summaryAckOp"] = {
			type: MessageType.SummaryAck,
			clientId: "server",
			sequenceNumber: 2,
			minimumSequenceNumber: 0,
			clientSequenceNumber: 0,
			referenceSequenceNumber: 1,
			timestamp: 0,
			contents: { handle: version, summaryProposal: { summarySequenceNumber: 1 } },
		};
		return {
			success: true,
			data: {
				ackNackDuration: 1,
				summaryAckOp,
			},
		};
	}

	function attempt(
		acknowledgement?: Promise<Ack>,
		proposal = "proposal",
		referenceSequenceNumber = 42,
	): {
		container: IContainer;
		events: TypedEventEmitter<IContainerEvents>;
		dispose: SinonSpy;
		started: Deferred<void>;
	} {
		const events = new TypedEventEmitter<IContainerEvents>();
		const started = new Deferred<void>();
		const dispose = sandbox.spy();
		const container = Object.assign(events, {
			closed: false,
			disposed: false,
			dispose,
			getEntryPoint: async () => ({
				ISummarizer: {
					summarizeOnDemand: () => {
						started.resolve();
						return {
							summarySubmitted: Promise.resolve({ success: true, data: { stage: "submit" } }),
							summaryOpBroadcasted: Promise.resolve({
								success: true,
								data: {
									summarizeOp: { contents: { handle: proposal }, referenceSequenceNumber },
								},
							}),
							receivedSummaryAckOrNack: acknowledgement,
						};
					},
				},
			}),
		});
		return { container: container as unknown as IContainer, events, dispose, started };
	}

	afterEach(() => sandbox.restore());

	it("default mode completes without ACK and supports older runtimes", async () => {
		for (const acknowledgement of [undefined, new Deferred<Ack>().promise]) {
			const current = attempt(acknowledgement);
			const resolve = sandbox.stub(Loader.prototype, "resolve").resolves(current.container);
			const result = await loadSummarizerContainerAndMakeSummary(props);
			assert(result.success);
			assert.equal(result.summaryResults.summarySubmitted, true);
			assert.equal(result.summaryResults.summaryOpBroadcasted, true);
			assert.equal(result.summaryResults.summaryInfo.stage, "submit");
			assert.equal(result.summaryResults.summaryInfo.handle, "proposal");
			assert.deepEqual(Object.keys(result).sort(), ["success", "summaryResults"]);
			assert.equal(current.dispose.callCount, 1);
			resolve.restore();
		}
	});

	it("keeps the container alive until ACK and returns the distinct ACK handle", async () => {
		const clock = sandbox.useFakeTimers();
		const acknowledgement = new Deferred<Ack>();
		const current = attempt(acknowledgement.promise);
		sandbox.stub(Loader.prototype, "resolve").resolves(current.container);
		let completed = false;
		const pending = loadSummarizerContainerAndMakeAcknowledgedSummary(props);
		const completion = pending.then(() => {
			completed = true;
		});
		await clock.tickAsync(0);
		assert.equal(completed, false);
		assert.equal(current.dispose.callCount, 0);
		acknowledgement.resolve(ack("ack-version"));
		const result = await pending;
		await completion;
		assert.deepEqual(result, { version: "ack-version", referenceSequenceNumber: 42 });
		assert.equal(current.dispose.callCount, 1);
		assert.equal(clock.countTimers(), 0);
		assert.equal(current.events.listenerCount("closed"), 0);
	});

	for (const failure of [
		"NACK",
		"runtime timeout",
		"closed",
		"disposed",
		"disconnected",
	] as const) {
		it(`rejects and disposes all loaded containers on ${failure}`, async () => {
			const clock = sandbox.useFakeTimers();
			const error = Object.assign(new GenericError(failure), { canRetry: true });
			const attempts = [0, 1].map(() =>
				attempt(
					failure === "NACK" || failure === "runtime timeout"
						? Promise.resolve({ success: false, error })
						: new Deferred<Ack>().promise,
				),
			);
			const resolve = sandbox.stub(Loader.prototype, "resolve");
			for (const [index, current] of attempts.entries()) {
				resolve.onCall(index).resolves(current.container);
			}
			const pending = loadSummarizerContainerAndMakeAcknowledgedSummary(props);
			const rejected = assert.rejects(pending, (caught: unknown) => {
				assert(caught instanceof Error);
				if (failure === "NACK" || failure === "runtime timeout") {
					assert.equal(caught, error);
				}
				return true;
			});
			for (const current of attempts) {
				await current.started.promise;
				if (failure === "closed" || failure === "disposed" || failure === "disconnected") {
					current.events.emit(failure);
				}
			}
			await rejected;
			assert.equal(resolve.callCount, attempts.length);
			for (const current of attempts) {
				assert.equal(current.dispose.callCount, 1);
				assert.equal(current.events.listenerCount("disposed"), 0);
			}
			assert.equal(clock.countTimers(), 0);
		});
	}

	it("returns version and reference sequence number after snapshot-refresh disposal", async () => {
		const first = attempt(new Deferred<Ack>().promise, "first-proposal", 10);
		const second = attempt(Promise.resolve(ack("second-version")), "second-proposal", 20);
		const resolve = sandbox.stub(Loader.prototype, "resolve");
		resolve.onFirstCall().resolves(first.container);
		resolve.onSecondCall().resolves(second.container);
		const pending = loadSummarizerContainerAndMakeAcknowledgedSummary(props);
		await first.started.promise;
		first.events.emit("disposed");
		const result = await pending;
		assert.deepEqual(result, { version: "second-version", referenceSequenceNumber: 20 });
		assert.equal(first.dispose.callCount, 1);
		assert.equal(second.dispose.callCount, 1);
	});

	it("returns the successful retry's version after a NACK", async () => {
		const first = attempt(
			Promise.resolve({ success: false, error: new GenericError("NACK") }),
			"first-proposal",
			10,
		);
		const second = attempt(Promise.resolve(ack("second-version")), "second-proposal", 20);
		const resolve = sandbox.stub(Loader.prototype, "resolve");
		resolve.onFirstCall().resolves(first.container);
		resolve.onSecondCall().resolves(second.container);
		const result = await loadSummarizerContainerAndMakeAcknowledgedSummary(props);
		assert.deepEqual(result, { version: "second-version", referenceSequenceNumber: 20 });
		assert.equal(resolve.callCount, 2);
		assert.equal(first.dispose.callCount, 1);
		assert.equal(second.dispose.callCount, 1);
	});

	for (const event of ["closed", "disposed"] as const) {
		for (const canRetry of [undefined, false, true]) {
			it(`preserves ${event} errors after one retry with canRetry=${canRetry}`, async () => {
				const error = Object.assign(
					new GenericError("container failure", { detail: "retained" }),
					{ canRetry },
				);
				const first = attempt(new Deferred<Ack>().promise);
				const second = attempt(new Deferred<Ack>().promise);
				const resolve = sandbox.stub(Loader.prototype, "resolve");
				resolve.onFirstCall().resolves(first.container);
				resolve.onSecondCall().resolves(second.container);
				const pending = loadSummarizerContainerAndMakeAcknowledgedSummary(props);
				const outcome = assert.rejects(pending, (caught: unknown) => {
					assert.equal(caught, error);
					return true;
				});
				await first.started.promise;
				first.events.emit(event, error);
				// Disposal may follow closure; preserve the first termination error.
				first.events.emit("disposed");
				await second.started.promise;
				second.events.emit(event, error);
				second.events.emit("disposed");
				await outcome;
				assert.equal(resolve.callCount, 2);
				assert.equal(first.dispose.callCount, 1);
				assert.equal(second.dispose.callCount, 1);
			});
		}
	}

	it("retains the existing API's unconditional failure-result retry", async () => {
		const first = attempt();
		const second = attempt();
		sandbox.stub(first.container, "getEntryPoint").rejects(new GenericError("non-retryable"));
		const resolve = sandbox.stub(Loader.prototype, "resolve");
		resolve.onFirstCall().resolves(first.container);
		resolve.onSecondCall().resolves(second.container);
		const result = await loadSummarizerContainerAndMakeSummary(props);
		assert(result.success);
		assert.equal(resolve.callCount, 2);
		assert.equal(first.dispose.callCount, 1);
		assert.equal(second.dispose.callCount, 1);
	});
});
