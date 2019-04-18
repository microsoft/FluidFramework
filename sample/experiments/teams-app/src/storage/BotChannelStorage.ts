
/** Context object passed to IBotChannelStorage calls. */
export interface IBotChannelStorageContext {
    /** ID of the team being persisted. If missing __channelData__ won't be persisted. */
    teamId?: string;
    /** ID of the channel being persisted. If missing __channelData__ won't be persisted. */
    channelId?: string;
}

/** Data values persisted to IBotChannelStorage. */
export interface IBotChannelStorageData {
    /** The bots shared data for a channel. This data is visible to every user within the channel.  */
    channelData?: any;
}

/** Replacable storage system used by UniversalBot. */
export interface IBotChannelStorage {
    /** Reads in data from storage. */
    getData(context: IBotChannelStorageContext): Promise<IBotChannelStorageData>;

    /** Writes out data to storage. */
    saveData(context: IBotChannelStorageContext, data: IBotChannelStorageData): Promise<void>;
}
