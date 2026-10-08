/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeView } from "@fluidframework/tree";
import { asBeta, Sandboxing } from "@fluidframework/tree/alpha";

import {
	bootstrapProtocol,
	discardBootstrapMessage,
	guestStartupTimeoutMs,
	isBootstrapMessage,
	toError,
	type BootstrapMessage,
} from "./bootstrap.js";
import type { Inventory } from "./schema.js";

export type HostSessionState =
	| { readonly status: "connecting" | "connected" }
	| { readonly status: "error"; readonly error: Error };

/**
 * Mounts one isolated Guest and borrows the application's inventory view.
 * @param mount - An otherwise empty element owned by the caller.
 * @param main - The application-owned view; this session never disposes it.
 * @param onState - Receives connection state and terminal errors.
 * @returns Idempotent cleanup that stops the iframe before disposing the Host endpoint.
 */
export function startHostSession(
	mount: HTMLElement,
	main: TreeView<typeof Inventory>,
	onState: (state: HostSessionState) => void,
): () => void {
	const sessionId = crypto.randomUUID();
	const iframe = document.createElement("iframe");
	iframe.title = "Guest inventory";
	iframe.setAttribute("sandbox", "allow-scripts");
	iframe.style.cssText = "width: 100%; min-height: 20rem; border: 1px solid #888;";
	const url = new URL("guest.html", location.href);
	url.hash = new URLSearchParams({ sessionId, parentOrigin: location.origin }).toString();

	let phase: "waiting" | "initializing" | "connected" | "disposed" = "waiting";
	let host: Sandboxing.Host | undefined;
	let channel: MessageChannel | undefined;

	function dispose(): void {
		if (phase === "disposed") {
			return;
		}
		phase = "disposed";
		window.clearTimeout(timer);
		window.removeEventListener("message", onMessage);
		window.removeEventListener("pagehide", onPageHide);
		iframe.removeEventListener("load", onLoad);
		iframe.removeEventListener("error", onLoadError);
		// Stop the Guest before reclaiming its ID space shard.
		iframe.remove();
		host?.dispose();
		channel?.port1.close();
		channel?.port2.close();
	}

	function fail(error: unknown): void {
		if (phase === "disposed") {
			return;
		}
		const failure = toError(error);
		console.error("Guest session failed:", failure);
		dispose();
		onState({ status: "error", error: failure });
	}

	function onLoadError(): void {
		fail(new Error("Failed to load the Guest iframe."));
	}

	function onLoad(): void {
		if (phase !== "waiting") {
			return;
		}
		phase = "initializing";
		try {
			const peer = iframe.contentWindow;
			if (peer === null) {
				throw new Error("Guest iframe has no window.");
			}
			// Successful Guest startup installs its listener synchronously, before this load event.
			channel = new MessageChannel();
			host = Sandboxing.createHost({
				main: asBeta(main),
				port: channel.port1,
				handleProtocolError: fail,
			});
			peer.postMessage(
				{
					protocol: bootstrapProtocol,
					sessionId,
					type: "initialize",
				} satisfies BootstrapMessage,
				"*",
				[channel.port2],
			);
			// Load can also fire after script failures; keep the deadline until Connected arrives.
		} catch (error) {
			fail(error);
		}
	}

	function onPageHide(event: PageTransitionEvent): void {
		if (!event.persisted) {
			dispose();
		}
	}

	function onMessage(event: MessageEvent<unknown>): void {
		const data = event.data;
		const peer = iframe.contentWindow;
		if (
			peer === null ||
			event.source !== peer ||
			event.origin !== "null" ||
			!isBootstrapMessage(data) ||
			data.sessionId !== sessionId ||
			event.ports.length > 0
		) {
			discardBootstrapMessage(event);
			return;
		}
		if (data.type === "error") {
			fail(new Error(data.error));
		} else if (data.type === "connected" && phase === "initializing") {
			phase = "connected";
			window.clearTimeout(timer);
			onState({ status: "connected" });
		} else {
			discardBootstrapMessage(event);
		}
	}

	onState({ status: "connecting" });
	window.addEventListener("message", onMessage);
	window.addEventListener("pagehide", onPageHide);
	iframe.addEventListener("load", onLoad);
	iframe.addEventListener("error", onLoadError);
	const timer = window.setTimeout(
		() => fail(new Error("Guest startup timed out. Reload the Host page to try again.")),
		guestStartupTimeoutMs,
	);
	try {
		iframe.src = url.href;
		mount.append(iframe);
	} catch (error) {
		fail(error);
	}
	return dispose;
}
