import { Db, MongoClient, MongoClientOptions } from "mongodb";
import { debug } from "./debug";

/**
 * Helper class to manage access to a MongoDb database
 */
export class MongoManager {
    private databaseP: Promise<Db>;

    constructor(private url: string, private shouldReconnect = true, private reconnectDelayMs = 1000) {
        this.connect();
    }

    /**
     * Retrieves the MongoDB database
     */
    public getDatabase(): Promise<Db> {
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
        this.databaseP = MongoClient
            .connect(
                this.url,
                <MongoClientOptions> (<any> {
                    autoReconnect: false,
                    bufferMaxEntries: 0,
                }))
            .then((db) => {
                db.on("error", (error) => {
                    debug("MongoDb Error", error);
                    this.reconnect();
                });

                db.on("close", (value) => {
                    debug("MongoDb Close", value);
                    this.reconnect();
                });

                return db;
            });

        this.databaseP.catch((error) => {
            debug("MongoDb Connection Error", error);
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
