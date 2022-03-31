/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios, { AxiosRequestHeaders } from "axios";
import safeStringify from "json-stringify-safe";
import nconf from "nconf";
import { getCorrelationId } from "@fluidframework/server-services-utils";
import * as uuid from "uuid";
import * as winston from "winston";

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

    private getCommonHeaders(): AxiosRequestHeaders {
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-correlation-id": getCorrelationId() || uuid.v4(),
        };
    }

    public async read(tenantId: string, documentId: string): Promise<boolean> {
        if (!this.config.get("externalStorage:enabled")) {
            winston.info("External storage is not enabled");
            return false;
        }
        let result = true;
        await Axios.post<void>(
            `${this.endpoint}/file/${tenantId}/${documentId}`,
            undefined,
            {
                headers: {
                    ...this.getCommonHeaders(),
                },
            }).catch((error) => {
                const messageMetaData = { tenantId, documentId };
                winston.error(`Failed to read document: ${safeStringify(error, undefined, 2)}`, { messageMetaData });
                result = false;
            });

        return result;
    }

    public async write(tenantId: string, ref: string, sha: string, update: boolean): Promise<void> {
        if (!this.config.get("externalStorage:enabled")) {
            winston.info("External storage is not enabled");
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
            }).catch((error) => {
                const messageMetaData = { tenantId, ref };
                winston.error(`Failed to write to file: ${safeStringify(error, undefined, 2)}`, { messageMetaData });
                throw error;
            });
    }
}
