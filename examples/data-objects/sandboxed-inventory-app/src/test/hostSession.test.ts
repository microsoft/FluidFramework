/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { cleanupEphemeralService } from "@fluidframework/local-driver/alpha";
import { FormatValidatorBasic, Sandboxing } from "@fluidframework/tree/alpha";
import globalJsdom from "global-jsdom";

import { bootstrapProtocol } from "../bootstrap.js";
import { loadHost, type HostContainer } from "../host.js";
import { startHostSession, type HostSessionState } from "../hostSession.js";
import { treeConfiguration } from "../schema.js";

import { captureMessages, controlStartupTimer, message, receive } from "./sessionTestUtils.js";

describe("Host bootstrap", () => {
	let cleanupDom: () => void;
	let container: HostContainer;
	let stop: () => void;
	let mount: HTMLDivElement;
	let states: HostSessionState[];
	let guest: Sandboxing.Guest | undefined;

	beforeEach(async () => {
		cleanupDom = globalJsdom(undefined, { url: "http://localhost/?fluidClient=ephemeral" });
		container = await loadHost();
		mount = document.createElement("div");
		document.body.append(mount);
		states = [];
		stop = () => {};
	});

	afterEach(async () => {
		guest?.dispose();
		guest = undefined;
		stop();
		container.data.dispose();
		container.close();
		await cleanupEphemeralService();
		cleanupDom();
	});

	function start(): {
		iframe: HTMLIFrameElement;
		peer: Window;
		sessionId: string;
		sent: ReturnType<typeof captureMessages>;
	} {
		stop = startHostSession(mount, container.data, (state) => states.push(state));
		const iframe = mount.querySelector("iframe");
		assert(iframe !== null);
		const peer = iframe.contentWindow;
		assert(peer !== null);
		const sessionId = new URLSearchParams(new URL(iframe.src).hash.slice(1)).get("sessionId");
		assert(sessionId !== null && sessionId.length > 0);
		return { iframe, peer, sessionId, sent: captureMessages(peer) };
	}

	it("mounts an isolated Guest with a fresh session and pinned parent origin", () => {
		const first = start();
		assert.equal(first.iframe.getAttribute("sandbox"), "allow-scripts");
		assert.equal(first.iframe.title, "Guest inventory");
		assert.equal(new URL(first.iframe.src).pathname, "/guest.html");
		assert.equal(
			new URLSearchParams(new URL(first.iframe.src).hash.slice(1)).get("parentOrigin"),
			location.origin,
		);
		assert.deepEqual(states, [{ status: "connecting" }]);
		stop();
		const second = start();
		assert.notEqual(first.sessionId, second.sessionId);
		assert.equal(mount.querySelectorAll("iframe").length, 1);
	});

	it("transfers exactly one port on load, includes early Host edits, and waits for Connected", async () => {
		const timer = controlStartupTimer();
		const { iframe, peer, sessionId, sent } = start();
		receive(peer, "null", message(sessionId, "connected"));
		assert.deepEqual(states, [{ status: "connecting" }]);
		assert.equal(sent.length, 0);
		container.data.root.parts.insertAtEnd({ name: "washer", quantity: 1 });
		iframe.dispatchEvent(new window.Event("load"));
		iframe.dispatchEvent(new window.Event("load"));
		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0]?.data, message(sessionId, "initialize"));
		assert.equal(sent[0]?.origin, "*");
		assert.equal(sent[0]?.ports?.length, 1);
		const port = sent[0]?.ports?.[0];
		assert(port instanceof MessagePort);
		guest = await Sandboxing.createGuest({
			port,
			treeOptions: { jsonValidator: FormatValidatorBasic },
		});
		const view = guest.tree.viewWith(treeConfiguration);
		assert.equal(view.root.parts.at(-1)?.name, "washer");
		assert.equal(view.root.parts.at(-1)?.quantity, 1);
		assert.deepEqual(states, [{ status: "connecting" }]);
		receive(peer, "null", message(sessionId, "connected"));
		assert.deepEqual(states, [{ status: "connecting" }, { status: "connected" }]);
		assert.equal(timer.isCleared(), true);

		view.root.parts.insertAtEnd({ name: "screw", quantity: 2 });
		await guest.updateHostPromise;
		assert(container.data.root.parts.some((part) => part.name === "screw"));
	});

	it("installs load and message listeners before navigating and mounting the iframe", () => {
		const append = mount.append.bind(mount);
		let sent: ReturnType<typeof captureMessages> = [];
		mount.append = (...nodes): void => {
			append(...nodes);
			const iframe = mount.querySelector("iframe");
			assert(iframe?.contentWindow !== null && iframe?.contentWindow !== undefined);
			sent = captureMessages(iframe.contentWindow);
			const sessionId = new URLSearchParams(new URL(iframe.src).hash.slice(1)).get(
				"sessionId",
			);
			assert(sessionId !== null);
			iframe.dispatchEvent(new window.Event("load"));
			receive(iframe.contentWindow, "null", message(sessionId, "connected"));
		};
		start();
		assert.equal(sent.length, 1);
		assert.deepEqual(states, [{ status: "connecting" }, { status: "connected" }]);
	});

	it("stops the iframe before disposing an endpoint after transfer failure", () => {
		const originalCreate = Sandboxing.createHost;
		let disposed = false;
		Sandboxing.createHost = (options) => {
			const endpoint = originalCreate(options);
			const dispose = endpoint.dispose.bind(endpoint);
			endpoint.dispose = () => {
				assert.equal(mount.childElementCount, 0);
				disposed = true;
				dispose();
			};
			return endpoint;
		};
		try {
			const { iframe, peer } = start();
			peer.postMessage = () => {
				throw new Error("Port transfer failed");
			};
			iframe.dispatchEvent(new window.Event("load"));
			assert.equal(disposed, true);
			const state = states.at(-1);
			assert(state?.status === "error");
			assert.equal(state.error.message, "Port transfer failed");
			container.data.root.parts.insertAtEnd({ name: "Host survives", quantity: 0 });
		} finally {
			Sandboxing.createHost = originalCreate;
		}
	});

	it("rejects other senders, origins, sessions, shapes, and unexpected ports", () => {
		const { iframe, peer, sessionId, sent } = start();
		iframe.dispatchEvent(new window.Event("load"));
		assert.equal(sent.length, 1);
		const channel = new MessageChannel();
		let closed = false;
		const close = channel.port1.close.bind(channel.port1);
		channel.port1.close = () => {
			closed = true;
			close();
		};
		try {
			receive(window, "null", message(sessionId, "connected"));
			receive(peer, location.origin, message(sessionId, "connected"));
			receive(peer, "null", message("stale", "connected"));
			receive(peer, "null", { ...message(sessionId, "connected"), extra: true });
			receive(peer, "null", message(sessionId, "initialize"));
			receive(peer, "null", message(sessionId, "connected"), [channel.port1]);
			assert.deepEqual(states, [{ status: "connecting" }]);
			assert.equal(closed, true);
			receive(peer, "null", message(sessionId, "connected"));
			assert.deepEqual(states, [{ status: "connecting" }, { status: "connected" }]);
			assert.equal(sent.length, 1);
		} finally {
			channel.port1.close();
			channel.port2.close();
		}
	});

	it("times out after load without Connected, removes the iframe, and preserves the Host view", () => {
		const timer = controlStartupTimer();
		const { iframe, peer, sessionId } = start();
		iframe.dispatchEvent(new window.Event("load"));
		assert.equal(timer.isCleared(), false);
		timer.expire();
		assert.equal(states.at(-1)?.status, "error");
		assert.equal(mount.querySelectorAll("iframe").length, 0);
		assert.equal(timer.isCleared(), true);
		container.data.root.parts.insertAtEnd({ name: "still editable", quantity: 0 });
		assert.equal(container.data.root.parts.at(-1)?.name, "still editable");
		receive(peer, "null", message(sessionId, "connected"));
		assert.equal(states.length, 2);
		stop();
		stop();
	});

	it("times out if the iframe never loads and ignores a late load after disposal", () => {
		const timer = controlStartupTimer();
		const { iframe, sent } = start();
		timer.expire();
		assert.equal(states.at(-1)?.status, "error");
		assert.equal(mount.childElementCount, 0);
		iframe.dispatchEvent(new window.Event("load"));
		assert.equal(sent.length, 0);
		assert.equal(states.length, 2);
	});

	it("surfaces Guest initialization errors and iframe load errors", () => {
		const { peer, sessionId } = start();
		receive(peer, "null", {
			protocol: bootstrapProtocol,
			sessionId,
			type: "error",
			error: "Guest unavailable",
		});
		const state = states.at(-1);
		assert(state?.status === "error");
		assert.equal(state.error.message, "Guest unavailable");
		assert.equal(mount.childElementCount, 0);
		const next = start();
		next.iframe.dispatchEvent(new window.Event("error"));
		assert.equal(states.at(-1)?.status, "error");
		assert.equal(mount.childElementCount, 0);
	});

	it("preserves a cached page's session but disposes it when the page is discarded", () => {
		start();
		window.dispatchEvent(new window.PageTransitionEvent("pagehide", { persisted: true }));
		assert.equal(mount.querySelectorAll("iframe").length, 1);
		window.dispatchEvent(new window.PageTransitionEvent("pagehide", { persisted: false }));
		assert.equal(mount.childElementCount, 0);
	});
});
