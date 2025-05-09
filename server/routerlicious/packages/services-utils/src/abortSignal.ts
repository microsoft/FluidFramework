/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getGlobalAbortControllerContext } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import type { Request, Response, RequestHandler, NextFunction } from "express";

export function addAbortControllerForRequestMiddleware(): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		const abortController = getGlobalAbortControllerContext().getAbortController();
		if (!abortController) {
			Lumberjack.error("AbortController not found in context", {
				url: request.originalUrl,
				method: request.method,
			});
			return next();
		}
		// Set up listener for client disconnection
		request.socket.on("close", () => {
			// Only if the response has not been sent yet, abort the signal
			// and remove the abort signal from the manager
			if (!response.headersSent) {
				if (abortController) {
					Lumberjack.info("Client aborted socket connection", {
						url: request.originalUrl,
						method: request.method,
					});

					abortController.abort("Client aborted socket connection");
				}
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
}
