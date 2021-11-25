/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { IDb, IDbFactory } from "./database";
import { debug } from "./debug";

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
        Lumberjack.info("Call close connection to MongoDB");
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
                    Lumberjack.error("DB Error", undefined, error);
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("close", (value) => {
                    debug("DB Close");
                    Lumberjack.info("DB Close");
                    this.reconnect(this.reconnectDelayMs);
                });

                db.on("reconnect", (value) => {
                    debug("DB Reconnect");
                    Lumberjack.info("DB Reconnect");
                });

                db.on("reconnectFailed", (value) => {
                    debug("DB Reconnect failed");
                    Lumberjack.error("DB Reconnect failed", undefined, value);
                });

                return db;
            });

        databaseP.catch((error) => {
            debug("DB Connection Error", error);
            Lumberjack.error("DB Connection Error", undefined, error);
            this.reconnect(this.reconnectDelayMs);
        });

        debug("Successfully connected to MongoDB");
        Lumberjack.info("Successfully connected to MongoDB");
        return databaseP;
    }

    /**
     * Reconnects to MongoDb
     */
    private reconnect(delay) {
        if (!this.shouldReconnect) {
            debug("Should not reconnect to MongoDB");
            Lumberjack.info("Should not reconnect to MongoDB");
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
