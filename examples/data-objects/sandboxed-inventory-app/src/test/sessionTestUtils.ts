/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	bootstrapProtocol,
	guestStartupTimeoutMs,
	type BootstrapMessage,
} from "../bootstrap.js";

export function message(
	sessionId: string,
	type: "initialize" | "connected",
): BootstrapMessage {
	return { protocol: bootstrapProtocol, sessionId, type };
}

export function captureMessages(target: Window): {
	data: unknown;
	origin: string | WindowPostMessageOptions | undefined;
	ports: Transferable[] | undefined;
}[] {
	const messages: ReturnType<typeof captureMessages> = [];
	target.postMessage = (
		data: unknown,
		origin?: string | WindowPostMessageOptions,
		ports?: Transferable[],
	): void => {
		messages.push({ data, origin, ports });
	};
	return messages;
}

export function receive(
	source: Window,
	origin: string,
	data: unknown,
	ports: MessagePort[] = [],
): void {
	window.dispatchEvent(new window.MessageEvent("message", { source, origin, data, ports }));
}

export function controlStartupTimer(): {
	expire: () => void;
	isCleared: () => boolean;
} {
	let callback: (() => void) | undefined;
	let cleared = false;
	const target: Window = window;
	const originalSet = target.setTimeout.bind(target);
	const originalClear = target.clearTimeout.bind(target);
	target.setTimeout = (
		handler: TimerHandler,
		timeout?: number,
		...args: unknown[]
	): number => {
		if (timeout !== guestStartupTimeoutMs) {
			return originalSet(handler, timeout, ...args);
		}
		if (typeof handler !== "function") {
			throw new TypeError("Expected a timer callback.");
		}
		callback = handler as () => void;
		return -1;
	};
	target.clearTimeout = (id): void => {
		if (id === -1) {
			cleared = true;
		} else {
			originalClear(id);
		}
	};
	return {
		expire: () => {
			if (!cleared) {
				if (callback === undefined) {
					throw new Error("Startup timer was not installed.");
				}
				callback();
			}
		},
		isCleared: () => cleared,
	};
}
