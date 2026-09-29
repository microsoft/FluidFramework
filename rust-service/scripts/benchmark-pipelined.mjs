/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert/strict";
import { setImmediate as yieldToEventLoop } from "node:timers/promises";
import { hasPendingDrain } from "./benchmark-gates.mjs";

/**
 * Resolves the Tinylicious workaround's per-generator bounds, not transport windows.
 * @param {object} configuration - Stress-runner configuration.
 * @returns {object} Explicit limits and completion semantics for retained results.
 */
export function pipelinedConfiguration(configuration) {
	assert.equal(configuration.backend, "tinylicious", "pipelined mode requires Tinylicious");
	assert.equal(configuration.loadMode, "pipelined");
	assert.equal(configuration.rate, undefined, "pipelined mode has no offered rate");
	assert.equal(configuration.generator, undefined, "pipelined mode requires the Node generator");
	assert.equal(
		configuration.transport,
		undefined,
		"pipelined mode uses the driver Socket.IO transport",
	);
	const limits = {
		maxOutstandingOperations:
			configuration.maxOutstandingOperations === undefined
				? 256
				: configuration.maxOutstandingOperations,
		maxOutstandingBytes:
			configuration.maxOutstandingBytes === undefined
				? 2 * 1024 * 1024
				: configuration.maxOutstandingBytes,
		drainTimeoutSeconds:
			configuration.drainTimeoutSeconds === undefined
				? 30
				: configuration.drainTimeoutSeconds,
		yieldEveryOperations: 64,
		chargeBytesPerOperation: configuration.payloadBytes,
		windowScope: "generator",
		byteAccounting: "logical-ascii-payload",
		completionSignal: "sequenced-writer-echo",
		transportBackpressure: false,
	};
	for (const key of ["maxOutstandingOperations", "maxOutstandingBytes"]) {
		assert.ok(Number.isSafeInteger(limits[key]) && limits[key] > 0, key);
	}
	assert.ok(
		Number.isSafeInteger(configuration.payloadBytes) &&
			configuration.payloadBytes >= 8 &&
			configuration.payloadBytes <= 8192,
		"payloadBytes",
	);
	assert.ok(
		limits.maxOutstandingBytes >= configuration.payloadBytes,
		"maxOutstandingBytes must fit at least one payload",
	);
	assert.ok(
		Number.isInteger(limits.drainTimeoutSeconds) &&
			limits.drainTimeoutSeconds >= 1 &&
			limits.drainTimeoutSeconds <= 120,
		"drainTimeoutSeconds must be between 1 and 120",
	);
	return limits;
}

/**
 * Runs a bounded, unpaced window without retaining per-operation history.
 * Writer echoes release credits; both readers must still validate and drain.
 * @param {object} configuration - Validated stress-runner configuration.
 * @param {object} dependencies - Connection, start barrier, and optional test clock hooks.
 * @returns {Promise<object>} Raw counters, limits, and classified failures, including failed runs.
 */
export async function runPipelinedWorker(
	configuration,
	{
		openPair,
		ready,
		now = () => performance.now(),
		yieldToIO = yieldToEventLoop,
		setTimer = setTimeout,
		clearTimer = clearTimeout,
	},
) {
	const limits = pipelinedConfiguration(configuration);
	const suffix = "x".repeat(configuration.payloadBytes - 8);
	const documents = [];
	const errors = [];
	const failures = [];
	let closing = false;
	let wake;
	let warmEnd = Infinity;
	let end = Infinity;
	let outstanding = 0;
	let maxInFlight = 0;
	let sent = 0;
	let measuredSent = 0;
	let writerEchoesInWindow = 0;
	let outstandingAtEnd = 0;
	let pendingAtEnd = 0;
	let drainSeconds = 0;
	let windowWaits = 0;
	let yields = 0;
	let lastDeliveryAt = -Infinity;
	let cpuStart = process.cpuUsage();
	let cpu;
	const failure = (error, category = "connection") => {
		if (!closing && errors.length < 10) {
			errors.push(String(error));
			failures.push({ category, error: String(error) });
		}
		wake?.();
	};
	const waitForProgress = (deadline) =>
		new Promise((resolveWait) => {
			const finish = () => {
				clearTimer(timer);
				wake = undefined;
				resolveWait();
			};
			const timer = setTimer(finish, Math.max(0, deadline - now()));
			wake = finish;
		});
	const inWindow = (timestamp) => timestamp >= warmEnd && timestamp < end;
	try {
		for (let index = 0; index < configuration.documents; index++) {
			const state = { sent: 0, observed: [0, 0], receivedInWindow: [0, 0] };
			documents.push(state);
			state.pair = await openPair(
				configuration,
				(recipient, payload) => {
					try {
						assert.ok(recipient === 0 || recipient === 1, "invalid recipient");
						assert.equal(typeof payload, "string", "payload corruption");
						const sequence = state.observed[recipient] + 1;
						assert.ok(sequence <= state.sent, "unsent or duplicate operation");
						assert.equal(
							payload,
							String(sequence).padStart(8, "0") + suffix,
							"payload corruption, missing, duplicate, or reordered operation",
						);
						state.observed[recipient]++;
						lastDeliveryAt = now();
						const measured = inWindow(lastDeliveryAt);
						if (measured) state.receivedInWindow[recipient]++;
						if (recipient === 0) {
							outstanding--;
							if (measured) writerEchoesInWindow++;
						}
						wake?.();
					} catch (error) {
						failure(error, "integrity");
					}
				},
				failure,
			);
		}
		await ready();
		cpuStart = process.cpuUsage();
		const start = now();
		warmEnd = start + configuration.warmupSeconds * 1000;
		end = warmEnd + configuration.seconds * 1000;
		const hasCredit = () =>
			outstanding < limits.maxOutstandingOperations &&
			(outstanding + 1) * configuration.payloadBytes <= limits.maxOutstandingBytes;
		while (now() < end && errors.length === 0) {
			for (
				let count = 0;
				count < limits.yieldEveryOperations &&
				hasCredit() &&
				now() < end &&
				errors.length === 0;
				count++
			) {
				const state = documents[sent % documents.length];
				if (state.sent === 99_999_999) {
					failure(
						"eight-digit per-document sequence capacity reached",
						"sequence-capacity",
					);
					break;
				}
				const sequence = ++state.sent;
				sent++;
				outstanding++;
				if (inWindow(now())) measuredSent++;
				maxInFlight = Math.max(maxInFlight, outstanding);
				try {
					state.pair.submit(sequence, String(sequence).padStart(8, "0") + suffix);
				} catch (error) {
					failure(error, "submit");
				}
			}
			// Even synchronous echoes must not turn replenishment into a microtask busy loop.
			yields++;
			await yieldToIO();
			if (!hasCredit() && now() < end && errors.length === 0) {
				windowWaits++;
				await waitForProgress(end);
			}
		}
		outstandingAtEnd = outstanding;
		pendingAtEnd = documents.reduce((sum, state) => sum + state.sent - state.observed[1], 0);
		const drainStart = now();
		const drainDeadline = drainStart + limits.drainTimeoutSeconds * 1000;
		while (
			errors.length === 0 &&
			hasPendingDrain(documents, "tinylicious") &&
			now() < drainDeadline
		) {
			await waitForProgress(drainDeadline);
		}
		drainSeconds = (now() - drainStart) / 1000;
		if (
			errors.length === 0 &&
			(hasPendingDrain(documents, "tinylicious") || lastDeliveryAt > drainDeadline)
		) {
			failure("pipelined workload did not drain before its deadline", "drain-timeout");
		}
	} catch (error) {
		failure(error, "setup");
	} finally {
		cpu = process.cpuUsage(cpuStart);
		closing = true;
		let timer;
		try {
			await Promise.race([
				Promise.all(documents.map((state) => state.pair?.close())),
				new Promise((_, reject) => {
					timer = setTimer(() => reject(new Error("connection close timed out")), 2000);
				}),
			]);
		} catch (error) {
			errors.push(String(error));
			failures.push({ category: "cleanup", error: String(error) });
		} finally {
			clearTimer(timer);
		}
	}
	const readerOutcomes = documents.flatMap((state, document) =>
		state.observed.map((delivered, recipient) => ({
			document,
			recipient,
			shed: false,
			delivered,
			undelivered: state.sent - delivered,
			receivedInWindow: state.receivedInWindow[recipient],
		})),
	);
	return {
		type: "result",
		documentCount: documents.length,
		sent,
		measuredSent,
		acknowledged: null,
		writerEchoes: documents.reduce((sum, state) => sum + state.observed[0], 0),
		writerEchoesInWindow,
		deliveredInWindow: documents.reduce((sum, state) => sum + state.receivedInWindow[1], 0),
		missing: readerOutcomes.reduce((sum, reader) => sum + reader.undelivered, 0),
		errors,
		failures,
		readerOutcomes,
		maxInFlight,
		maxOutstandingBytes: maxInFlight * configuration.payloadBytes,
		outstandingAtEnd,
		outstandingBytesAtEnd: outstandingAtEnd * configuration.payloadBytes,
		outstandingAfterDrain: outstanding,
		pendingAtEnd,
		drainSeconds,
		windowWaits,
		yields,
		pipeline: limits,
		generatorCpuSeconds: (cpu.user + cpu.system) / 1000000,
		generatorPeakRssKiB: process.resourceUsage().maxRSS,
	};
}
