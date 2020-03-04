/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerClient } from "@azure/storage-blob";
import * as winston from "winston";

export interface ISearchStorage {
    upload(key: string, html: string): Promise<void>;
}

export class AzureBlobService implements ISearchStorage {
    constructor(private client: ContainerClient) { }

    public async upload(key: string, html: string): Promise<void> {
        const blockBlobClient = this.client.getBlockBlobClient(key);
        await blockBlobClient.upload(html, html.length)
            .then(() => {
                return;
            })
            .catch((err) => {
                winston.error("Could not upload search blob", err);
                return;
            });
    }
}
