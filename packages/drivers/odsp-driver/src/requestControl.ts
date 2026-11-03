/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OdspOperation } from "./odspOperation.js";

/**
 * Request-local hooks run at the HTTP boundary, after concurrency queuing.
 */
export interface RequestControl {
	beforeRequest(): Promise<void>;
	onError(error: unknown): void;
}

const controls = new WeakMap<RequestInit, RequestControl>();
const operations = new WeakMap<RequestInit, OdspOperation>();

export function withOdspOperation<T extends RequestInit>(
	options: T,
	operation: OdspOperation | undefined,
): T {
	if (operation === undefined) {
		operations.delete(options);
	} else {
		operations.set(options, operation);
	}
	return options;
}

export function getOdspOperation(options: RequestInit): OdspOperation | undefined {
	return operations.get(options);
}

export function withRequestControl(
	options: RequestInit,
	control?: RequestControl,
): RequestInit {
	if (control !== undefined) {
		controls.set(options, control);
	}
	return options;
}

export function getRequestControl(options: RequestInit): RequestControl | undefined {
	return controls.get(options);
}
