/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import Axios from "axios";
import * as winston from "winston";

/**
 * Manages api calls to external storage
 */
export class ExternalStorageManager {
    constructor(private endpoint: string) {
    }

    public async readAndSync(tenantId: string, documentId: string): Promise<void> {
        if (!process.env.EXTERNAL_STORAGE_ENABLED || process.env.EXTERNAL_STORAGE_ENABLED == "false") {
            winston.info(`External storage is not enabled`);
            return;
        }
        winston.info("Gitrest calling read from external storage on tenant " + tenantId + "/" + documentId);
        await Axios.get<void>(
            `${this.endpoint}/file/${tenantId}/${documentId}`,
            {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            }).catch((error) => {
                console.log("Axios error " + error + " tenantId " + tenantId);
                throw error;
            });

        winston.info("Read and sync successful");
    }

    public async writeFile(tenantId: string, ref: string, sha: string, update: boolean): Promise<void> {
        if (!process.env.EXTERNAL_STORAGE_ENABLED || process.env.EXTERNAL_STORAGE_ENABLED == "false") {
            winston.info(`External storage is not enabled`);
            return;
        }
        winston.info("Gitrest calling write to external storage on tenant " + tenantId);
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
            });
    }
}
