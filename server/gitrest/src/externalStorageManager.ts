/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios from "axios";
import safeStringify from "json-stringify-safe";
import * as nconf from "nconf";
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

    public async read(tenantId: string, documentId: string): Promise<boolean> {
        if (!this.config.get("externalStorage:enabled")) {
            winston.info("External storage is not enabled");
            return false;
        }
        await Axios.post<void>(
            `${this.endpoint}/file/${tenantId}/${documentId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            }).catch((error) => {
                const messageMetaData = { tenantId, documentId };
                winston.error(`Failed to read document: ${safeStringify(error, undefined, 2)}`, { messageMetaData });
                return false;
            });

        return true;
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
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            }).catch((error) => {
                const messageMetaData = { tenantId, ref };
                winston.error(`Failed to write to file: ${safeStringify(error, undefined, 2)}`, { messageMetaData });
                throw error;
            });
    }
}
