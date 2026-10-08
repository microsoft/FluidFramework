/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Identifies the version of the application's Host/Guest bootstrap protocol.
 *
 * @remarks
 * These messages use `window.postMessage`, not the port owned by the tree synchronization protocol.
 */
export const bootstrapProtocol = "fluid-sandboxed-inventory-v1";

/**
 * Startup deadline duration, in milliseconds, used independently by the Host and Guest.
 *
 * @remarks
 * The Host starts its timer before navigating the iframe, so its deadline includes Guest script loading.
 * The Guest starts its timer during synchronous startup, while waiting for the Host's port.
 */
export const guestStartupTimeoutMs = 30_000;

/**
 * An application message used to initialize a sandbox session or report its status.
 *
 * @remarks
 * The Host assigns a fresh session identifier to each iframe session attempt.
 * Transferred ports are carried separately in `MessageEvent.ports`, not in this envelope.
 */
export type BootstrapMessage = {
	/**
	 * The expected application protocol identifier and version.
	 */
	readonly protocol: typeof bootstrapProtocol;

	/**
	 * The nonempty identifier for the Host-created session attempt.
	 * Matching this identifier does not replace validation of the sender's window and origin.
	 */
	readonly sessionId: string;
} & (
	| {
			/**
			 * The initialization stage reported by the sender.
			 *
			 * @remarks
			 * - `initialize`: The Host transfers exactly one port to the Guest.
			 * - `connected`: The Guest has created its typed view and committed its inventory UI.
			 *
			 * `connected` does not mean that all edits have been acknowledged or sequenced by Fluid services.
			 */
			readonly type: "initialize" | "connected";
	  }
	| {
			/**
			 * Identifies a terminal Guest failure reported to the Host.
			 */
			readonly type: "error";

			/**
			 * Human-readable failure text for the Host to display.
			 */
			readonly error: string;
	  }
);

/**
 * Checks the shape of an application bootstrap message.
 *
 * @param value - Untrusted message data, usually from `MessageEvent.data`.
 * @returns Whether the value has the expected protocol identifier, nonempty session identifier, and message fields.
 *
 * @remarks
 * This check does not validate the sender's window or origin, the active session identifier,
 * message ordering, or transferred ports.
 * The receiving endpoint must check these before accepting the message.
 */
export function isBootstrapMessage(value: unknown): value is BootstrapMessage {
	if (
		typeof value !== "object" ||
		value === null ||
		!("protocol" in value) ||
		value.protocol !== bootstrapProtocol ||
		!("sessionId" in value) ||
		typeof value.sessionId !== "string" ||
		value.sessionId.length === 0 ||
		!("type" in value)
	) {
		return false;
	}
	if (value.type === "error") {
		return (
			Object.keys(value).length === 4 && "error" in value && typeof value.error === "string"
		);
	}
	return (
		Object.keys(value).length === 3 &&
		(value.type === "initialize" || value.type === "connected")
	);
}

/**
 * Reads the Host-supplied bootstrap parameters without accessing the parent document.
 *
 * @param url - The Guest URL, with bootstrap parameters in its fragment.
 * @returns The session identifier and exact HTTP(S) parent origin.
 * @throws If either parameter is missing, repeated, or invalid.
 *
 * @remarks
 * The origin must contain no credentials, path, query, or fragment.
 * Parsing these parameters does not authenticate a message sender; the Guest must also check
 * that messages come from its parent window and match this origin and session.
 */
export function readGuestParameters(url: URL): {
	/**
	 * The nonempty session identifier supplied by the Host.
	 */
	sessionId: string;

	/**
	 * The exact HTTP(S) origin to use for parent message validation and as the target origin of replies.
	 */
	parentOrigin: string;
} {
	const params = new URLSearchParams(url.hash.slice(1));
	const sessionId = params.get("sessionId");
	const parentOrigin = params.get("parentOrigin");
	if (
		sessionId === null ||
		sessionId.length === 0 ||
		parentOrigin === null ||
		parentOrigin.length === 0 ||
		params.getAll("sessionId").length !== 1 ||
		params.getAll("parentOrigin").length !== 1
	) {
		throw new Error("Guest requires one session identifier and one parent origin.");
	}
	const parentURL = new URL(parentOrigin);
	if (
		(parentURL.protocol !== "http:" && parentURL.protocol !== "https:") ||
		parentURL.origin !== parentOrigin
	) {
		throw new Error("Guest requires an exact HTTP(S) parent origin.");
	}
	return { sessionId, parentOrigin };
}

/**
 * Logs a rejected bootstrap message and closes all ports transferred with it.
 *
 * @param event - A message that failed validation or arrived out of order.
 *
 * @remarks
 * Call this only for discarded messages whose ports have not been adopted by an endpoint.
 */
export function discardBootstrapMessage(event: MessageEvent<unknown>): void {
	console.warn("Ignoring invalid or out-of-order sandbox bootstrap message.");
	for (const port of event.ports) {
		port.close();
	}
}

/**
 * Converts a caught value to an error for display or reporting.
 *
 * @param error - The caught value.
 * @returns The original error if it is an `Error` in the current JavaScript realm;
 * otherwise, a new error whose message is the string representation of the value.
 */
export function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}
