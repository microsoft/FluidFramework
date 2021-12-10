/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDb, IDbFactory } from "./database";

import { debug } from "./debug";

/**
 * Helper class to manage access to a DynamoDB database
 */
export class DynamoManager {
    private databaseP: Promise<IDb>;

    constructor(
        private readonly factory: IDbFactory,
        private shouldReconnect = true,
        private readonly reconnectDelayMs = 1000) {
        this.databaseP = this.connect();
    }

    /**
     * Retrieves the DynamoDB database
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getDatabase(): Promise<IDb> {
        return this.databaseP;
    }

    /**
     * Closes the connection to DynamoDB
     */
    public async close(): Promise<void> {
        debug("Call close connection to DynamoDB");
        this.shouldReconnect = false;
        const database = await this.databaseP;
        return database.close();
    }

    /**
     * Creates a connection to the DynamoDB database
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private connect(): Promise<IDb> {
        const databaseP = this.factory.connect()
            .then((db) => {
                db.on("error", (error) => {
                    debug("DynamoDB Error", error);
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("close", (value) => {
                    debug("DynamoDB Close");
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("reconnect", (value) => {
                    debug("DynamoDB Reconnect");
                });

                db.on("reconnectFailed", (value) => {
                    debug("DynamoDB Reconnect failed");
                });
                return db;
            });
        databaseP.catch((error) => {
            debug("DB Connection Error", error);
            this.reconnect(this.reconnectDelayMs);
        });
        debug("Successfully connected to DynamoDB");
        return databaseP;
    }

    /**
     * Reconnects to DynamoDB
     */
    private reconnect(delay) {
        if (!this.shouldReconnect) {
            debug("Should not reconnect to DynamoDB");
            return;
        }
        this.databaseP = new Promise<IDb>((resolve) => {
            setTimeout(
                () => {
                    const connectP = this.connect();
                    resolve(connectP);
                },
                delay);
        });
    }
}
