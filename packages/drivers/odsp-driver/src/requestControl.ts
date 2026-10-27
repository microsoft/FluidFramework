/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Request-local hooks run at the HTTP boundary, after concurrency queuing.
 */
export interface RequestControl {
	beforeRequest(): Promise<void>;
	onError(error: unknown): void;
}

const controls = new WeakMap<RequestInit, RequestControl>();

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
