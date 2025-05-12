/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobalAbortControllerContext } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { RequestHandler } from "express";

/**
 * Express.js Middleware that binds AbortControllerContext to the request for its lifetime.
 * Within the request flow, `getGlobalAbortControllerContext().getAbortController()` can then be called
 * to get the abort controller for the request.
 * @internal
 */
export const bindAbortControllerContext = (): RequestHandler => {
	return (request, response, next) => {
		const abortControllerContext = getGlobalAbortControllerContext();
		const abortController = new AbortController();
		abortControllerContext.bindAbortController(abortController, () => next());
		// Set up listener for client disconnection
		request.socket.on("close", () => {
			// Only if the response has not been sent yet, abort the signal
			// and remove the abort signal from the manager
			if (!response.headersSent) {
				Lumberjack.info("Client aborted socket connection", {
					url: request.originalUrl,
					method: request.method,
				});

				abortController?.abort("Client aborted socket connection");
			}
		});

		response.on("finish", () => {
			const signal = abortController?.signal;
			if (signal?.aborted) {
				Lumberjack.info("Request completed after abort", {
					reason: signal?.reason,
					url: request.originalUrl,
					method: request.method,
				});
			}
		});
		next();
	};
};
