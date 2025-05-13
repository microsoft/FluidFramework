/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as Axios, RawAxiosRequestHeaders } from "axios";
import nconf from "nconf";
import * as uuid from "uuid";
import {
	BaseTelemetryProperties,
	getLumberBaseProperties,
	Lumberjack,
	getGlobalTelemetryContext,
} from "@fluidframework/server-services-telemetry";
import { BaseGitRestTelemetryProperties } from "./utils";

export interface IExternalStorageManager {
	read(tenantId: string, documentId: string): Promise<boolean>;

	write(tenantId: string, ref: string, sha: string, update: boolean): Promise<void>;
}

/**
 * Manages api calls to external storage
 */
export class ExternalStorageManager implements IExternalStorageManager {
	private readonly endpoint: string;

	constructor(public readonly config: nconf.Provider) {
		this.endpoint = config.get("externalStorage:endpoint");
	}

	private getCommonHeaders(): RawAxiosRequestHeaders {
		return {
			"Accept": "application/json",
			"Content-Type": "application/json",
			"x-correlation-id":
				getGlobalTelemetryContext().getProperties().correlationId ?? uuid.v4(),
		};
	}

	public async read(tenantId: string, documentId: string): Promise<boolean> {
		const lumberjackProperties = getLumberBaseProperties(documentId, tenantId);
		if (!this.config.get("externalStorage:enabled")) {
			Lumberjack.info("External storage is not enabled", lumberjackProperties);
			return false;
		}
		let result = true;
		await Axios.post<void>(`${this.endpoint}/file/${tenantId}/${documentId}`, undefined, {
			headers: {
				...this.getCommonHeaders(),
			},
		}).catch((error) => {
			Lumberjack.error("Failed to read document", lumberjackProperties, error);
			result = false;
		});

		return result;
	}

	public async write(tenantId: string, ref: string, sha: string, update: boolean): Promise<void> {
		const lumberjackProperties = {
			[BaseTelemetryProperties.tenantId]: tenantId,
			[BaseGitRestTelemetryProperties.ref]: ref,
			[BaseGitRestTelemetryProperties.sha]: sha,
			update,
		};
		if (!this.config.get("externalStorage:enabled")) {
			Lumberjack.info("External storage is not enabled", lumberjackProperties);
			return;
		}
		await Axios.post<void>(
			`${this.endpoint}/file/${tenantId}`,
			{
				ref,
				sha,
				update,
			},
			{
				headers: {
					...this.getCommonHeaders(),
				},
			},
		).catch((error) => {
			Lumberjack.error("Failed to write to file", lumberjackProperties, error);
			throw error;
		});
	}
}

/**
 * Throws away calls to external storage.
 * For use in places where ExternalStorageManagement is explicitly not supported or does not make sense,
 * but the manager is needed for compatibility with interface definitions.
 */
export class NullExternalStorageManager implements IExternalStorageManager {
	public async read(tenantId: string, documentId: string): Promise<boolean> {
		return false;
	}

	public async write(
		tenantId: string,
		ref: string,
		sha: string,
		update: boolean,
	): Promise<void> {}
}
