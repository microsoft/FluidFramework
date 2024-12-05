/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getRandomInt } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import sizeof from "object-sizeof";
import { ISystemError } from "../fileSystemHelper";

export enum RedisFsApis {
	ReadFile = "ReadFile",
	WriteFile = "WriteFile",
	Unlink = "Unlink",
	Readdir = "Readdir",
	Removefile = "Removefile",
	Stat = "Stat",
	Mkdir = "Mkdir",
	Rmdir = "Rmdir",
	KeysByPrefix = "keysByPrefix",
	HKeysByPrefix = "hkeysByPrefix",
	InitHashmapFs = "initHashmapFs",
}

export enum RedisFSConstants {
	file = "file",
	directory = "directory",
	RedisFsApi = "RedisFsApi",
}

export async function executeRedisFsApiWithMetric<T>(
	api: () => Promise<T>,
	apiName: RedisFsApis,
	metricEnabled: boolean,
	samplingPeriod?: number,
	telemetryProperties?: Record<string, any>,
	logResponseSize: boolean = false,
): Promise<T> {
	if (!metricEnabled || (samplingPeriod && getRandomInt(samplingPeriod) !== 0)) {
		return api();
	}

	const metric = Lumberjack.newLumberMetric(RedisFSConstants.RedisFsApi, telemetryProperties);
	try {
		let responseSize;
		const result = await api();
		if (logResponseSize) {
			responseSize = sizeof(result);
		}
		metric.setProperty("responseSize", responseSize);
		metric.success(`${RedisFSConstants.RedisFsApi}: ${apiName} success`);
		return result;
	} catch (error: any) {
		metric.error(`${RedisFSConstants.RedisFsApi}: ${apiName} error`, error);
		throw error;
	}
}

export class RedisFsError extends Error {
	public get code() {
		return this.err.code;
	}

	constructor(
		public readonly err: ISystemError,
		message?: string,
	) {
		super(message ? `${err.description}: ${message}` : err.description);
		this.name = "RedisFsError";
	}
}
