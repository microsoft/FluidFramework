import { Db, MongoClient, MongoClientOptions } from "mongodb";

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
                    console.error("MongoDb Error");
                    console.error(error);
                    this.reconnect();
                });

                db.on("close", (value) => {
                    console.error("MongoDb Close");
                    console.error(value);
                    this.reconnect();
                });

                return db;
            });

        this.databaseP.catch((error) => {
            console.error("MongoDb Connection Error");
            console.error(error);
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
