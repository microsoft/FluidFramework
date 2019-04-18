// import * as assert from "assert";
import * as mongodb from "mongodb";
// import { IBotChannelStorageContext, IBotChannelStorageData, IBotChannelStorage } from "./BotChannelStorage";
import * as config from "config";

// tslint:disable-next-line:variable-name
export interface AADObjectIdEntry {
    _id?: string;
    aadObjectId: string;
    vstsToken: string;
    vstsRefreshToken: string;
};

export class MongoDbAADObjectIdStorage {

    // private initializePromise: Promise<void>;
    private mongoDb: mongodb.Db;
    private botStateCollection: mongodb.Collection;

    public static async createConnection(): Promise<MongoDbAADObjectIdStorage> {
        let collectionName = config.get("mongoDb.botStateCollection");
        let connectionString = config.get("mongoDb.connectionString");
        let resultMongoDbAADObjectIdStorage = new MongoDbAADObjectIdStorage(collectionName, connectionString);
        await resultMongoDbAADObjectIdStorage.initialize();
        return resultMongoDbAADObjectIdStorage;
    }

    constructor(
        private collectionName: string,
        private connectionString: string) {
    }

    // Reads in data from storage
    public async getEntryByAADObjectId(aadObjectId: string): Promise<any> {
        // if (context.channelId) {
            // await this.initialize();
            if (!this.botStateCollection) {
                return ({} as any);
            }

            // let filter = { "_id": _id };
            let filter = { "aadObjectId": aadObjectId };
            let entry = await this.botStateCollection.findOne(filter);
            // await this.close();
            if (entry) {
                return entry;
            } else {
                return ({} as any);
            }
        // } else {
        //     return { };
        // }
    }

    // Writes out data from storage
    public async saveTokensByAADObjectId(entry: AADObjectIdEntry): Promise<void> {
        // if (context.teamId && context.channelId && data.channelData) {
            // await this.initialize();
            if (!this.botStateCollection) {
                return;
            }

            let filter = { "_id": "aadObjectId:" + entry.aadObjectId };
            entry._id = "aadObjectId:" + entry.aadObjectId;
            // let document = {
            //     teamId: context.teamId,
            //     channelId: context.channelId,
            //     data: data.channelData,
            // };
            // let document = {
            //     token: tokens.token,
            //     refreshToken: tokens.refreshToken,
            // };
            await this.botStateCollection.updateOne(filter, entry, { upsert: true });
            // await this.close();
        // }
    }

    // Writes out data from storage
    public async saveBotEntry(entry: any): Promise<void> {
        // if (context.teamId && context.channelId && data.channelData) {
            // await this.initialize();
            if (!this.botStateCollection) {
                return;
            }

            let filter = { "_id": entry._id };
            // let document = {
            //     teamId: context.teamId,
            //     channelId: context.channelId,
            //     data: data.channelData,
            // };
            // let document = {
            //     token: tokens.token,
            //     refreshToken: tokens.refreshToken,
            // };
            await this.botStateCollection.updateOne(filter, entry, { upsert: true });
            // await this.close();
        // }
    }

    // Writes out data from storage
    public async deleteEntryByAADObjectId(aadObjectId: string): Promise<void> {
        // if (context.teamId && context.channelId && data.channelData) {
            // await this.initialize();
            if (!this.botStateCollection) {
                return;
            }

            let filter = { "_id": "aadObjectId:" + aadObjectId };
            // let document = {
            //     teamId: context.teamId,
            //     channelId: context.channelId,
            //     data: data.channelData,
            // };
            // let document = {
            //     token: tokens.token,
            //     refreshToken: tokens.refreshToken,
            // };
            await this.botStateCollection.deleteMany(filter);
            // await this.close();
        // }
    }

    // Close the connection to the database
    public async close(): Promise<void> {
        // this.initializePromise = null;
        this.botStateCollection = null;
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
                this.botStateCollection = await this.mongoDb.collection(this.collectionName);
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
