/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAbortControllerManager } from "@fluidframework/server-services-client";
import { getGlobalTelemetryContext, Lumberjack } from "@fluidframework/server-services-telemetry";
import type { Request, Response, RequestHandler, NextFunction } from "express";

export function addAbortControllerForRequestMiddleware(
	abortSignalManager?: IAbortControllerManager,
): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		if (!abortSignalManager) {
			Lumberjack.warning("AbortSignalManager is not provided");
			// If the abort signal manager is not provided, just call next
			return next();
		}
		const correlationId = getGlobalTelemetryContext().getProperties().correlationId;
		// Set up listener for client disconnection
		request.socket.on("close", () => {
			// Only if the response has not been sent yet, abort the signal
			// and remove the abort signal from the manager
			if (!response.headersSent) {
				// Get the correlationId from the request and add it to the abort signal manager
				// This assumes that the correlationId is set in the global telemetry context
				const abortController = abortSignalManager.getAbortController(correlationId);
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
			// Log if the request finished after being aborted
			// Get the correlationId from the request and add it to the abort signal manager
			// This assumes that the correlationId is set in the global telemetry context
			const abortController = abortSignalManager.getAbortController(correlationId);
			const signal = abortController?.signal;
			if (signal?.aborted) {
				Lumberjack.info("Request completed after abort", {
					reason: signal?.reason,
					url: request.originalUrl,
					method: request.method,
				});
			}
			// Remove the abort signal from the manager
			abortSignalManager?.removeAbortController(correlationId);
		});
		next();
	};
}

export class AbortControllerManager implements IAbortControllerManager {
	private readonly correlationIdToAbortControllerlMap: Map<string, AbortController> = new Map();

	constructor() {
		this.correlationIdToAbortControllerlMap = new Map();
	}

	// Historian.ts in services-client does not have access to the global telemetry context,
	// so we need to compute the correlationId in the AbortSignalManager
	// and pass it to the addAbortSignal method.
	private computeCorrelationId(correlationId?: string): string | undefined {
		if (!correlationId) {
			return getGlobalTelemetryContext().getProperties().correlationId;
		}
		return correlationId;
	}

	public addAbortController(abortController: AbortController, correlationId?: string): void {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}

		if (this.correlationIdToAbortControllerlMap.has(computedCorrelationId)) {
			Lumberjack.warning("Abort controller already exists for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return;
		}

		this.correlationIdToAbortControllerlMap.set(computedCorrelationId, abortController);
		Lumberjack.info("Abort controller added", {
			correlationId: computedCorrelationId,
		});
	}

	public removeAbortController(correlationId?: string): void {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}

		if (!this.correlationIdToAbortControllerlMap.has(computedCorrelationId)) {
			Lumberjack.warning("No abort signal found for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return;
		}
		this.correlationIdToAbortControllerlMap.delete(computedCorrelationId);
		Lumberjack.info("Abort signal removed", {
			correlationId: computedCorrelationId,
		});
	}

	public getAbortController(correlationId?: string): AbortController | undefined {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}
		const abortSignal = this.correlationIdToAbortControllerlMap.get(computedCorrelationId);
		if (!abortSignal) {
			Lumberjack.warning("No abort controller found for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return undefined;
		}
		Lumberjack.info("Abort controller retrieved", {
			correlationId: computedCorrelationId,
		});
		return abortSignal;
	}
}
