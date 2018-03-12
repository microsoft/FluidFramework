import * as winston from "winston";
import * as core from "./core";

/**
 * Helper class to manage access to a MongoDb database
 */
export class MongoManager {
    private databaseP: Promise<core.IDb>;

    constructor(private factory: core.IDbFactory, private shouldReconnect = true, private reconnectDelayMs = 1000) {
        this.connect();
    }

    /**
     * Retrieves the MongoDB database
     */
    public getDatabase(): Promise<core.IDb> {
        return this.databaseP;
    }

    /**
     * Closes the connection to MongoDB
     */
    public async close(): Promise<void> {
        this.shouldReconnect = false;
        const database = await this.databaseP;
        return database.close();
    }

    /**
     * Creates a connection to the MongoDB database
     */
    private connect() {
        this.databaseP = this.factory.connect()
            .then((db) => {
                db.on("error", (error) => {
                    winston.error(`DB error: ${error}`);
                    this.reconnect();
                });

                db.on("close", (value) => {
                    winston.info(`DB close: ${value}`);
                    this.reconnect();
                });

                return db;
            });

        this.databaseP.catch((error) => {
            winston.error(`DB connection error: ${error}`);
            this.reconnect();
        });
    }

    /**
     * Reconnects to MongoDb
     */
    private reconnect() {
        if (!this.shouldReconnect) {
            return;
        }

        setTimeout(() => {
            this.connect();
        }, this.reconnectDelayMs);
    }
}
