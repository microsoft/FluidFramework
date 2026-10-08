/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cleanupEphemeralService } from "@fluidframework/local-driver/alpha";
import { asBeta, FormatValidatorBasic, Sandboxing } from "@fluidframework/tree/alpha";
import globalJsdom from "global-jsdom";

import { isBootstrapMessage } from "../bootstrap.js";
import { startGuestSession, type GuestSessionState } from "../guestSession.js";
import { loadHost, type HostContainer } from "../host.js";

import { captureMessages, controlStartupTimer, message, receive } from "./sessionTestUtils.js";

describe("Guest bootstrap", () => {
	let cleanupDom: () => void;
	let container: HostContainer;
	let host: Sandboxing.Host;
	let channel: MessageChannel;
	let peer: Window;
	let sent: ReturnType<typeof captureMessages>;
	let states: GuestSessionState[];
	let stop: () => void;
	const sessionId = "guest-test-session";

	beforeEach(async () => {
		cleanupDom = globalJsdom(undefined, { url: "http://localhost/?fluidClient=ephemeral" });
		container = await loadHost();
		location.hash = new URLSearchParams({
			sessionId,
			parentOrigin: location.origin,
		}).toString();
		const frame = document.createElement("iframe");
		document.body.append(frame);
		assert(frame.contentWindow !== null);
		peer = frame.contentWindow;
		Object.defineProperty(window, "parent", { value: peer, configurable: true });
		sent = captureMessages(peer);
		states = [];
		stop = () => {};
		channel = new MessageChannel();
		host = Sandboxing.createHost({ main: asBeta(container.data), port: channel.port1 });
	});

	afterEach(async () => {
		stop();
		host.dispose();
		channel.port1.close();
		channel.port2.close();
		container.data.dispose();
		container.close();
		await cleanupEphemeralService();
		cleanupDom();
	});

	async function start(): Promise<GuestSessionState> {
		return new Promise((resolve) => {
			stop = startGuestSession((state) => {
				states.push(state);
				if (state.status !== "connecting") {
					resolve(state);
				}
			});
		});
	}

	function replaceGuestFactory(create: typeof Sandboxing.createGuest): () => void {
		const originalCreate = Sandboxing.createGuest;
		Sandboxing.createGuest = create;
		return () => {
			Sandboxing.createGuest = originalCreate;
		};
	}

	it("accepts a port immediately without a readiness exchange, renders, then reports Connected", async () => {
		const timer = controlStartupTimer();
		const ready = new Promise<GuestSessionState>((resolve, reject) => {
			stop = startGuestSession((nextState) => {
				if (nextState.status === "ready") {
					assert.equal(
						sent.some(({ data }) => isBootstrapMessage(data) && data.type === "connected"),
						false,
					);
					resolve(nextState);
				} else if (nextState.status === "error") {
					reject(nextState.error);
				}
				states.push(nextState);
			});
		});
		assert.equal(sent.length, 0);
		receive(peer, location.origin, message(sessionId, "initialize"), [channel.port2]);
		const state = await ready;
		assert(state.status === "ready");
		assert.notEqual(state.view.root, container.data.root);
		assert.deepEqual(
			[...state.view.root.parts].map((part) => part.name),
			["nut", "bolt"],
		);
		assert.deepEqual(sent.at(-1)?.data, message(sessionId, "connected"));
		assert.equal(sent.at(-1)?.origin, location.origin);
		assert.equal(timer.isCleared(), true);
		container.data.root.parts.insertAtEnd({ name: "washer", quantity: 3 });
		await host.updateGuestPromise;
		assert.equal(state.view.root.parts.at(-1)?.name, "washer");
	});

	it("rejects invalid senders, origins, sessions, shapes, port counts, and duplicate initialization", async () => {
		const ready = start();
		for (const [source, origin, data, count] of [
			[window, location.origin, message(sessionId, "initialize"), 1],
			[peer, "null", message(sessionId, "initialize"), 1],
			[peer, location.origin, message("stale", "initialize"), 1],
			[peer, location.origin, { invalid: true }, 1],
			[peer, location.origin, message(sessionId, "connected"), 1],
			[peer, location.origin, message(sessionId, "initialize"), 0],
			[peer, location.origin, message(sessionId, "initialize"), 2],
		] as const) {
			const extras = Array.from({ length: count }, () => new MessageChannel());
			let closed = 0;
			for (const extra of extras) {
				const close = extra.port1.close.bind(extra.port1);
				extra.port1.close = () => {
					closed++;
					close();
				};
			}
			try {
				receive(
					source,
					origin,
					data,
					extras.map((extra) => extra.port1),
				);
				assert.equal(closed, count);
				assert.equal(
					states.some((state) => state.status === "ready"),
					false,
				);
			} finally {
				for (const extra of extras) {
					extra.port1.close();
					extra.port2.close();
				}
			}
		}
		receive(peer, location.origin, message(sessionId, "initialize"), [channel.port2]);
		const readyState = await ready;
		assert.equal(readyState.status, "ready");
		const duplicate = new MessageChannel();
		let duplicateClosed = false;
		const closeDuplicate = duplicate.port1.close.bind(duplicate.port1);
		duplicate.port1.close = () => {
			duplicateClosed = true;
			closeDuplicate();
		};
		try {
			receive(peer, location.origin, message(sessionId, "initialize"), [duplicate.port1]);
			assert.equal(duplicateClosed, true);
			assert.equal(states.filter((state) => state.status === "ready").length, 1);
		} finally {
			duplicate.port1.close();
			duplicate.port2.close();
		}
	});

	it("reports timeout once while waiting for the Host", async () => {
		const timer = controlStartupTimer();
		const finished = start();
		timer.expire();
		const failedState = await finished;
		assert.equal(failedState.status, "error");
		assert.equal(states.at(-1)?.status, "error");
		assert.equal(
			states.some((state) => state.status === "ready"),
			false,
		);
		const data = sent.at(-1)?.data;
		assert(isBootstrapMessage(data) && data.type === "error");
		assert.match(data.error, /timed out/i);
		assert.equal(timer.isCleared(), true);
		stop();
		stop();
	});

	it("disposes a Guest that finishes initialization after timeout", async () => {
		const initialized = await Sandboxing.createGuest({
			port: channel.port2,
			treeOptions: { jsonValidator: FormatValidatorBasic },
		});
		const originalDispose = initialized.dispose.bind(initialized);
		const disposed = new Promise<void>((resolve) => {
			initialized.dispose = () => {
				originalDispose();
				resolve();
			};
		});
		let finish: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const restore = replaceGuestFactory(async () => {
			await gate;
			return initialized;
		});
		try {
			const timer = controlStartupTimer();
			const failed = start();
			receive(peer, location.origin, message(sessionId, "initialize"), [channel.port2]);
			timer.expire();
			const failedState = await failed;
			assert.equal(failedState.status, "error");
			finish();
			await disposed;
			assert.equal(
				states.some((state) => state.status === "ready"),
				false,
			);
			assert.equal(
				sent.some(({ data }) => isBootstrapMessage(data) && data.type === "connected"),
				false,
			);
		} finally {
			restore();
			finish();
			initialized.dispose();
		}
	});

	it("reports a rejected initialization and closes the received port", async () => {
		const restore = replaceGuestFactory(async () => {
			throw new Error("Initialization rejected");
		});
		let closed = false;
		const close = channel.port2.close.bind(channel.port2);
		channel.port2.close = () => {
			closed = true;
			close();
		};
		try {
			const failed = start();
			receive(peer, location.origin, message(sessionId, "initialize"), [channel.port2]);
			const state = await failed;
			assert(state.status === "error");
			assert.equal(state.error.message, "Initialization rejected");
			assert.equal(closed, true);
			const data = sent.at(-1)?.data;
			assert(isBootstrapMessage(data) && data.type === "error");
		} finally {
			restore();
		}
	});

	it("reports a rendering failure without announcing Connected", async () => {
		const failed = new Promise<GuestSessionState>((resolve) => {
			stop = startGuestSession((state) => {
				if (state.status === "ready") {
					throw new Error("Rendering failed");
				}
				states.push(state);
				if (state.status === "error") {
					resolve(state);
				}
			});
		});
		receive(peer, location.origin, message(sessionId, "initialize"), [channel.port2]);
		const failedState = await failed;
		assert.equal(failedState.status, "error");
		const failureMessage = sent.at(-1)?.data;
		assert(isBootstrapMessage(failureMessage) && failureMessage.type === "error");
		assert.equal(
			sent.some(({ data }) => isBootstrapMessage(data) && data.type === "connected"),
			false,
		);
	});
});
