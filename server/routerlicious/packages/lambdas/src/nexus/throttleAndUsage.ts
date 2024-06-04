/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	clientConnectivityStorageId,
	ThrottlingError,
	type ILogger,
	type IThrottleAndUsageStorageManager,
	type IThrottler,
	type IUsageData,
} from "@fluidframework/server-services-core";
import {
	BaseTelemetryProperties,
	CommonProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import safeStringify from "json-stringify-safe";

export const getSocketConnectThrottleId = (tenantId: string): string =>
	`${tenantId}_OpenSocketConn`;

export const getSubmitOpThrottleId = (clientId: string, tenantId: string): string =>
	`${clientId}_${tenantId}_SubmitOp`;

export const getSubmitSignalThrottleId = (clientId: string, tenantId: string): string =>
	`${clientId}_${tenantId}_SubmitSignal`;

/**
 * Stores client connectivity time in a Redis list.
 */
export async function storeClientConnectivityTime(
	clientId: string,
	documentId: string,
	tenantId: string,
	connectionTimestamp: number,
	throttleAndUsageStorageManager: IThrottleAndUsageStorageManager,
): Promise<void> {
	try {
		const now = Date.now();
		const connectionTimeInMinutes = (now - connectionTimestamp) / 60000;
		const storageId = clientConnectivityStorageId;
		const usageData = {
			value: connectionTimeInMinutes,
			tenantId,
			documentId,
			clientId,
			startTime: connectionTimestamp,
			endTime: now,
		};
		await throttleAndUsageStorageManager.setUsageData(storageId, usageData);
	} catch (error) {
		Lumberjack.error(
			`ClientConnectivity data storage failed`,
			{
				[CommonProperties.clientId]: clientId,
				[BaseTelemetryProperties.tenantId]: tenantId,
				[BaseTelemetryProperties.documentId]: documentId,
			},
			error,
		);
	}
}

// TODO: semantic documentation
// eslint-disable-next-line jsdoc/require-description
/**
 * @returns ThrottlingError if throttled; undefined if not throttled or no throttler provided.
 */
export function checkThrottleAndUsage(
	throttler: IThrottler | undefined,
	throttleId: string,
	tenantId: string,
	logger?: ILogger,
	usageStorageId?: string,
	usageData?: IUsageData,
	incrementWeight: number = 1,
): ThrottlingError | undefined {
	if (!throttler) {
		return;
	}

	try {
		throttler.incrementCount(throttleId, incrementWeight, usageStorageId, usageData);
	} catch (error) {
		if (error instanceof ThrottlingError) {
			return error;
		} else {
			logger?.error(`Throttle increment failed: ${safeStringify(error, undefined, 2)}`, {
				messageMetaData: {
					key: throttleId,
					eventName: "throttling",
				},
			});
			Lumberjack.error(
				`Throttle increment failed`,
				{
					[CommonProperties.telemetryGroupName]: "throttling",
					[BaseTelemetryProperties.tenantId]: tenantId,
				},
				error,
			);
		}
	}
}
