/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/core-utils/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import { OdspErrorTypes } from "@fluidframework/odsp-driver-definitions/internal";

import { pkgVersion as driverVersion } from "./packageVersion.js";

/**
 * Rejects a join-session caller after its document service is disposed.
 */
export function checkJoinSessionDisposed(signal: AbortSignal): void {
	if (signal.aborted) {
		throw createJoinSessionDisposedError();
	}
}

function createJoinSessionDisposedError(): NonRetryableError<
	typeof OdspErrorTypes.genericError
> {
	return new NonRetryableError(
		"Document service is disposed. Cannot join session",
		OdspErrorTypes.genericError,
		{ driverVersion },
	);
}

/**
 * Stops one caller from waiting without cancelling the cache's shared work.
 */
export async function waitForJoinSession<T>(
	promise: Promise<T>,
	signal: AbortSignal,
): Promise<T> {
	const cancelled = new Deferred<never>();
	const abort = (): void => cancelled.reject(createJoinSessionDisposedError());
	signal.addEventListener("abort", abort, { once: true });
	if (signal.aborted) {
		abort();
	}
	try {
		return await Promise.race([promise, cancelled.promise]);
	} finally {
		signal.removeEventListener("abort", abort);
	}
}
