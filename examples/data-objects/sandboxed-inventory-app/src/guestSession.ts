/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeView } from "@fluidframework/tree";
import { FormatValidatorBasic, Sandboxing } from "@fluidframework/tree/alpha";

import {
	bootstrapProtocol,
	discardBootstrapMessage,
	guestStartupTimeoutMs,
	isBootstrapMessage,
	readGuestParameters,
	toError,
	type BootstrapMessage,
} from "./bootstrap.js";
import { type Inventory, treeConfiguration } from "./schema.js";

export type GuestSessionState =
	| { readonly status: "connecting" }
	| { readonly status: "ready"; readonly view: TreeView<typeof Inventory> }
	| { readonly status: "error"; readonly error: Error };

/**
 * Initializes one independent Guest tree from the expected parent.
 * @param render - Synchronously commits a view or error UI before returning.
 * @returns Idempotent cleanup. Unmount the Guest UI before explicitly calling it.
 * @throws If the page is not embedded or has invalid bootstrap parameters.
 *
 * @remarks
 * Call synchronously during Guest entry-point execution, not after an asynchronous task or in a React effect.
 * The message listener must be installed before the iframe's `load` event triggers the Host's port transfer.
 */
export function startGuestSession(render: (state: GuestSessionState) => void): () => void {
	// The Host supplies these values in the fragment because the opaque-origin Guest cannot read
	// the parent's document or location. The parent Window reference itself is still accessible.
	const { sessionId, parentOrigin } = readGuestParameters(new URL(location.href));
	const parent = window.parent;
	if (parent === window) {
		throw new Error("Open the Host page to load an isolated Guest.");
	}
	let phase: "waiting" | "initializing" | "ready" | "disposed" = "waiting";
	let guest: Sandboxing.Guest | undefined;
	let port: MessagePort | undefined;

	function dispose(): void {
		if (phase === "disposed") {
			return;
		}
		// Mark the session inactive before releasing resources so late completions cannot revive it.
		phase = "disposed";
		window.clearTimeout(timer);
		window.removeEventListener("message", onMessage);
		guest?.dispose();
		// Initialization may still be pending, with a port but no Guest endpoint available to dispose.
		port?.close();
	}

	function fail(error: unknown): void {
		if (phase === "disposed") {
			return;
		}
		const failure = toError(error);
		console.error("Guest session failed:", failure);
		try {
			// Synchronously remove the editable UI before disposal invalidates its observed tree views.
			render({ status: "error", error: failure });
			// Replies target the known parent origin; only messages addressed to the opaque-origin Guest need "*".
			parent.postMessage(
				{
					protocol: bootstrapProtocol,
					sessionId,
					type: "error",
					error: failure.message,
				} satisfies BootstrapMessage,
				parentOrigin,
			);
		} finally {
			dispose();
		}
	}

	async function initialize(receivedPort: MessagePort): Promise<void> {
		try {
			// Wait for the Host's initial state over the port; the Guest does not load a Fluid container.
			const initialized = await Sandboxing.createGuest({
				port: receivedPort,
				treeOptions: { jsonValidator: FormatValidatorBasic },
				handleProtocolError: fail,
			});
			if (phase === "disposed") {
				// The startup deadline or caller may have ended the session while creation was pending.
				initialized.dispose();
				return;
			}
			guest = initialized;
			// A resolved initialization promise does not guarantee the endpoint is still healthy.
			if (guest.error !== undefined) {
				throw guest.error;
			}
			const view = guest.tree.viewWith(treeConfiguration);
			// The caller must commit this UI synchronously so "connected" cannot precede rendering.
			render({ status: "ready", view });
			phase = "ready";
			window.clearTimeout(timer);
			parent.postMessage(
				{
					protocol: bootstrapProtocol,
					sessionId,
					type: "connected",
				} satisfies BootstrapMessage,
				parentOrigin,
			);
		} catch (error) {
			fail(error);
		}
	}

	function onMessage(event: MessageEvent<unknown>): void {
		const data = event.data;
		// A valid envelope alone is insufficient: bind initialization to the expected parent,
		// origin, and session, and accept exactly one port only while waiting for initialization.
		if (
			event.source !== parent ||
			event.origin !== parentOrigin ||
			!isBootstrapMessage(data) ||
			data.sessionId !== sessionId ||
			data.type !== "initialize" ||
			event.ports.length !== 1 ||
			phase !== "waiting"
		) {
			discardBootstrapMessage(event);
			return;
		}
		port = event.ports[0];
		if (port === undefined) {
			throw new Error("Guest initialization requires one port.");
		}
		// Reserve the attempt before awaiting so duplicate messages cannot create a second Guest.
		phase = "initializing";
		// Event dispatch cannot await this work. Initialization reports its own failures;
		// the outer rejection handler also logs errors thrown by failure reporting or cleanup.
		initialize(port).catch((error: unknown) => console.error("Guest cleanup failed:", error));
	}

	render({ status: "connecting" });
	// Install synchronously so the Host can transfer the port on iframe load without a readiness exchange.
	window.addEventListener("message", onMessage);
	const timer = window.setTimeout(
		() => fail(new Error("Guest startup timed out. Reload the Host page to try again.")),
		guestStartupTimeoutMs,
	);
	return dispose;
}
