// import * as assert from "assert";
import * as mongodb from "mongodb";
// import { IBotChannelStorageContext, IBotChannelStorageData, IBotChannelStorage } from "./BotChannelStorage";
import * as config from "config";

// tslint:disable-next-line:variable-name
export interface TempTokensEntry {
    _id: string;
    token: string;
    refreshToken: string;
};

/** Replacable storage system used by UniversalBot. */
export class MongoDbTempTokensStorage {

    // private initializePromise: Promise<void>;
    private mongoDb: mongodb.Db;
    private tempTokensCollection: mongodb.Collection;

    public static async createConnection(): Promise<MongoDbTempTokensStorage> {
        let collectionName = config.get("mongoDb.tempTokensCollection");
        let connectionString = config.get("mongoDb.connectionString");
        let resultMongoDbTempTokensStorage = new MongoDbTempTokensStorage(collectionName, connectionString);
        await resultMongoDbTempTokensStorage.initialize();
        return resultMongoDbTempTokensStorage;
    }

    constructor(
        private collectionName: string,
        private connectionString: string) {
    }

    // Reads in data from storage
    public async getTempTokensAsync(_id: string): Promise<TempTokensEntry> {
        // if (context.channelId) {
            // await this.initialize();
            if (!this.tempTokensCollection) {
                return ({} as any);
            }

            let filter = { "_id": _id };
            let tempTokensEntry = await this.tempTokensCollection.findOne(filter);
            // await this.close();
            if (tempTokensEntry) {
                return tempTokensEntry;
            } else {
                return ({} as any);
            }
        // } else {
        //     return { };
        // }
    }

    // Writes out data from storage
    public async saveTempTokensAsync(tempTokensEntry: TempTokensEntry): Promise<void> {
        // if (context.teamId && context.channelId && data.channelData) {
            // await this.initialize();
            if (!this.tempTokensCollection) {
                return;
            }

            let filter = { "_id": tempTokensEntry._id };
            // let document = {
            //     teamId: context.teamId,
            //     channelId: context.channelId,
            //     data: data.channelData,
            // };
            // let document = {
            //     token: tokens.token,
            //     refreshToken: tokens.refreshToken,
            // };
            await this.tempTokensCollection.updateOne(filter, tempTokensEntry, { upsert: true });
            // await this.close();
        // }
    }

    // Writes out data from storage
    public async deleteTempTokensAsync(_id: string): Promise<void> {
        // if (context.teamId && context.channelId && data.channelData) {
            // await this.initialize();
            if (!this.tempTokensCollection) {
                return;
            }

            let filter = { "_id": _id };
            // let document = {
            //     teamId: context.teamId,
            //     channelId: context.channelId,
            //     data: data.channelData,
            // };
            // let document = {
            //     token: tokens.token,
            //     refreshToken: tokens.refreshToken,
            // };
            await this.tempTokensCollection.deleteMany(filter);
            // await this.close();
        // }
    }

    // Close the connection to the database
    public async close(): Promise<void> {
        // this.initializePromise = null;
        this.tempTokensCollection = null;
        if (this.mongoDb) {
            await this.mongoDb.close();
            this.mongoDb = null;
        }
    }

    // Returns a promise that is resolved when this instance is initialized
    // private initialize(): Promise<void> {
    //     if (!this.initializePromise) {
    //         this.initializePromise = this.initializeWorker();
    //     }
    //     return this.initializePromise;
    // }

    // Initialize this instance
    private async initialize(): Promise<void> {
        if (!this.mongoDb) {
            try {
                this.mongoDb = await mongodb.MongoClient.connect(this.connectionString);
                this.tempTokensCollection = await this.mongoDb.collection(this.collectionName);
            } catch (e) {
                // console.log(e.toString());
                await this.close();
                // this.initializePromise = null;
            }
        }
    }

    // // Get id for channel data documents
    // private getChannelDataId(context: IBotChannelStorageContext): string {
    //     assert(context.channelId);
    //     return `channel:${context.channelId}`;
    // }
}
