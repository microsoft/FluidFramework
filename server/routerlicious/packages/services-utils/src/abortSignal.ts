/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IAbortSignalManager } from "@fluidframework/server-services-client";
import { getGlobalTelemetryContext, Lumberjack } from "@fluidframework/server-services-telemetry";
import type { Request, Response, RequestHandler, NextFunction } from "express";

export function addAbortControllerForRequestMiddleware(
	abortSignalManager?: IAbortSignalManager,
): RequestHandler {
	return (request: Request, response: Response, next: NextFunction) => {
		if (!abortSignalManager) {
			Lumberjack.warning("AbortSignalManager is not provided");
			// If the abort signal manager is not provided, just call next
			return next();
		}
		// Get the correlationId from the request and add it to the abort signal manager
		// This assumes that the correlationId is set in the global telemetry context
		const correlationId = getGlobalTelemetryContext().getProperties().correlationId;
		const abortController = new AbortController();
		const signal = abortController.signal;
		abortSignalManager.addAbortSignal(abortController.signal, correlationId);
		// Set up listener for client disconnection
		request.socket.on("close", () => {
			// Only if the response has not been sent yet, abort the signal
			// and remove the abort signal from the manager
			if (!response.headersSent) {
				Lumberjack.info("Client aborted socket connection", {
					url: request.originalUrl,
					method: request.method,
				});
				abortController.abort("Client aborted socket connection");
			}
		});

		response.on("finish", () => {
			// Log if the request finished after being aborted
			if (signal.aborted) {
				Lumberjack.info("Request completed after abort", {
					reason: signal.reason,
					url: request.originalUrl,
					method: request.method,
				});
			}
			// Remove the abort signal from the manager
			abortSignalManager.removeAbortSignal(correlationId);
		});
		next();
	};
}

export class AbortSignalManager implements IAbortSignalManager {
	private readonly correlationIdToAbortSignalMap: Map<string, AbortSignal> = new Map();

	constructor() {
		this.correlationIdToAbortSignalMap = new Map();
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

	public addAbortSignal(abortSignal: AbortSignal, correlationId?: string): void {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}

		if (this.correlationIdToAbortSignalMap.has(computedCorrelationId)) {
			Lumberjack.warning("Abort signal already exists for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return;
		}

		this.correlationIdToAbortSignalMap.set(computedCorrelationId, abortSignal);
		Lumberjack.info("Abort signal added", {
			correlationId: computedCorrelationId,
		});
	}

	public removeAbortSignal(correlationId?: string): void {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}

		if (!this.correlationIdToAbortSignalMap.has(computedCorrelationId)) {
			Lumberjack.warning("No abort signal found for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return;
		}
		this.correlationIdToAbortSignalMap.delete(computedCorrelationId);
		Lumberjack.info("Abort signal removed", {
			correlationId: computedCorrelationId,
		});
	}

	public getAbortSignal(correlationId?: string): AbortSignal | undefined {
		const computedCorrelationId = this.computeCorrelationId(correlationId);
		// Return if no correlationId is provided
		if (!computedCorrelationId) {
			return;
		}
		const abortSignal = this.correlationIdToAbortSignalMap.get(computedCorrelationId);
		if (!abortSignal) {
			Lumberjack.warning("No abort signal found for this correlationId", {
				correlationId: computedCorrelationId,
			});
			return undefined;
		}
		Lumberjack.info("Abort signal retrieved", {
			correlationId: computedCorrelationId,
		});
		return abortSignal;
	}
}
