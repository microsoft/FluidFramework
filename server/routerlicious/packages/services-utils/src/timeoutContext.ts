/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobalTimeoutContext } from "@fluidframework/server-services-client";
import type { RequestHandler } from "express";

/**
 * Express.js Middleware that binds TimeoutContext to the request for its lifetime.
 * Within the request flow, `getGlobalTimeoutContext().checkTimeout()` can then be called
 * strategically to terminate request processing early in case of timeout.
 * @internal
 */
export const bindTimeoutContext = (maxRequestDurationMs: number): RequestHandler => {
	return (req, res, next) => {
		const timeoutContext = getGlobalTimeoutContext();
		timeoutContext.bindTimeout(maxRequestDurationMs, () => next());
	};
};
