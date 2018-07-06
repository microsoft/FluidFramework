import * as core from "../core";
import { debug } from "./debug";

/**
 * Helper class to manage access to a MongoDb database
 */
export class MongoManager {
    private databaseP: Promise<core.IDb>;

    constructor(private factory: core.IDbFactory, private shouldReconnect = true, private reconnectDelayMs = 1000) {
        this.connect(0);
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
     * Reconnects to MongoDb
     */
    private connect(delay) {
        if (!this.shouldReconnect) {
            return;
        }

        this.databaseP = new Promise<core.IDb>((resolve) => {
            setTimeout(
                () => {
                    const connectP = this.connectCore();
                    resolve(connectP);
                },
                delay);
        });
    }

    /**
     * Creates a connection to the MongoDB database
     */
    private connectCore(): Promise<core.IDb> {
        const databaseP = this.factory.connect()
            .then((db) => {
                db.on("error", (error) => {
                    debug("DB Error", error);
                    this.connect(this.reconnectDelayMs);
                });

                db.on("close", (value) => {
                    debug("DB Close", value);
                    this.connect(this.reconnectDelayMs);
                });

                return db;
            });

        databaseP.catch((error) => {
            debug("DB Connection Error", error);
            this.connect(this.reconnectDelayMs);
        });

        return databaseP;
    }
}
