/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ConnectionMode,
	IClientDetails,
	ISentSignalMessage,
} from "@fluidframework/protocol-definitions";
import { NetworkError, canSummarize, canWrite } from "@fluidframework/server-services-client";
import type { ILogger } from "@fluidframework/server-services-core";
import {
	Lumberjack,
	getGlobalTelemetryContext,
	getLumberBaseProperties,
} from "@fluidframework/server-services-telemetry";

import type { IRoom } from "./interfaces";

export const getMessageMetadata = (
	documentId: string,
	tenantId: string,
	correlationId?: string,
	// TODO: add a type for this
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
) => ({
	documentId,
	tenantId,
	correlationId,
});

export function handleServerErrorAndConvertToNetworkError(
	logger: ILogger,
	errorMessage: string,
	documentId: string,
	tenantId: string,
	error: unknown,
): NetworkError {
	const errMsgWithPrefix = `Connect Server Error - ${errorMessage}`;
	const correlationId = getGlobalTelemetryContext().getProperties().correlationId;
	logger.error(errMsgWithPrefix, {
		messageMetaData: getMessageMetadata(documentId, tenantId, correlationId),
	});
	Lumberjack.error(errMsgWithPrefix, getLumberBaseProperties(documentId, tenantId), error);
	return new NetworkError(
		500,
		`Failed to connect client to document. Check correlation Id ${correlationId} for details.`,
	);
}

export class ExpirationTimer {
	private timer: ReturnType<typeof setInterval> | undefined;
	/**
	 * The time at which the timer was started.
	 */
	private startTime: number | undefined;
	/**
	 * The time at which the timer was paused.
	 * If the timer is not paused, this will be undefined.
	 */
	private pauseTime: number | undefined;
	/**
	 * The time in milliseconds from start time until the timer expires.
	 * If the timer is not set, this will be undefined.
	 * If the timer is set or paused, this will be the original time until expiration of the most recent timer start.
	 */
	private mSecUntilExpiration: number | undefined;

	constructor(private readonly onTimeout: () => void) {}

	private stopTimer(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	/**
	 * Clears the timer if it is set.
	 */
	public clear(): void {
		this.stopTimer();
		this.startTime = undefined;
		this.pauseTime = undefined;
		this.mSecUntilExpiration = undefined;
	}
	/**
	 * Sets a timer to call the onTimeout function after the specified milliseconds.
	 * Clears any existing timer before setting a new one.
	 * @param mSecUntilExpiration - The number of milliseconds until the timer expires.
	 */
	public set(mSecUntilExpiration: number): void {
		this.clear();
		this.startTime = Date.now();
		this.pauseTime = undefined;
		this.mSecUntilExpiration = mSecUntilExpiration;
		this.timer = setTimeout(() => {
			this.onTimeout();
			this.clear();
		}, mSecUntilExpiration);
	}

	public pause(): void {
		if (
			this.timer === undefined ||
			this.startTime === undefined ||
			this.pauseTime !== undefined ||
			this.mSecUntilExpiration === undefined
		) {
			return;
		}
		// Clear the timer and set the pause time and remaining time until expiration
		// to calculate the remaining time when resuming.
		this.stopTimer();
		this.pauseTime = Date.now();
	}

	public resume(): void {
		if (
			this.timer !== undefined ||
			this.startTime === undefined ||
			this.pauseTime === undefined ||
			this.mSecUntilExpiration === undefined
		) {
			return;
		}
		// Calculate the remaining time until expiration based on the pause time and start time.
		const remainingTime = this.mSecUntilExpiration - (this.pauseTime - this.startTime);
		this.pauseTime = undefined;
		this.set(remainingTime);
	}
}

export const hasWriteAccess = (scopes: string[]): boolean =>
	canWrite(scopes) || canSummarize(scopes);
export const isWriter = (scopes: string[], mode: ConnectionMode): boolean =>
	hasWriteAccess(scopes) && mode === "write";
export const SummarizerClientType = "summarizer";
export const isSummarizer = (clientDetails: IClientDetails): boolean =>
	clientDetails.type === SummarizerClientType || clientDetails.capabilities.interactive === false;

export const getRoomId = (room: IRoom): string => `${room.tenantId}/${room.documentId}`;
export const getClientSpecificRoomId = (clientId: string): string => `client#${clientId}`;

export function isSentSignalMessage(obj: unknown): obj is ISentSignalMessage {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"content" in obj &&
		(!("type" in obj) || typeof obj.type === "string") &&
		(!("clientConnectionNumber" in obj) || typeof obj.clientConnectionNumber === "number") &&
		(!("referenceSequenceNumber" in obj) || typeof obj.referenceSequenceNumber === "number") &&
		(!("targetClientId" in obj) || typeof obj.targetClientId === "string")
	);
}
