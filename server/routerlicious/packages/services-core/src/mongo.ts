/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection } from "./database";
import { debug } from "./debug";

export interface IDb {
    close(): Promise<void>;

    on(event: string, listener: (...args: any[]) => void);

    collection<T>(name: string): ICollection<T>;
}

export interface IDbFactory {
    connect(): Promise<IDb>;
}

/**
 * Helper class to manage access to a MongoDb database
 */
export class MongoManager {
    private databaseP: Promise<IDb>;

    constructor(
        private readonly factory: IDbFactory,
        private shouldReconnect = true,
        private readonly reconnectDelayMs = 1000) {
        this.databaseP = this.connect();
    }

    /**
     * Retrieves the MongoDB database
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getDatabase(): Promise<IDb> {
        return this.databaseP;
    }

    /**
     * Closes the connection to MongoDB
     */
    public async close(): Promise<void> {
        debug("Call close connection to MongoDB");
        this.shouldReconnect = false;
        const database = await this.databaseP;
        return database.close();
    }

    /**
     * Creates a connection to the MongoDB database
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private connect(): Promise<IDb> {
        const databaseP = this.factory.connect()
            .then((db) => {
                db.on("error", (error) => {
                    debug("DB Error", error);
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("close", (value) => {
                    debug("DB Close");
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("reconnect", (value) => {
                    debug("DB Reconnect");
                });

                db.on("reconnectFailed", (value) => {
                    debug("DB Reconnect failed");
                });

                return db;
            });

        databaseP.catch((error) => {
            debug("DB Connection Error", error);
            this.reconnect(this.reconnectDelayMs);
        });

        debug("Successfully connected to MongoDB");
        return databaseP;
    }

    /**
     * Reconnects to MongoDb
     */
    private reconnect(delay) {
        if (!this.shouldReconnect) {
            debug("Should not reconnect to MongoDB");
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
