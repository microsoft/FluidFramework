import * as builder from "botbuilder";
import { IBotChannelStorageData, IBotChannelStorage } from "../storage/BotChannelStorage";
import * as DialogUtils from "./DialogUtils";

// Helper class to manage channel data
export class ChannelData  {

    // Gets the channel data from the Session object
    public static get(session: builder.Session): any {
        return (session as any).channelData;
    }

    // Saves the channel data to channel data storage
    public static async saveToStorage(session: builder.Session, storage: IBotChannelStorage): Promise<void> {
        if (storage) {
            let teamId = DialogUtils.getTeamId(session.message);
            let channelId = DialogUtils.getChannelId(session.message);
            let channelStorageData = (session as IBotChannelStorageData);
            if (channelId) {
                let context = { teamId: teamId, channelId: channelId };
                await storage.saveData(context, channelStorageData);
            } else {
                // This is not in the context of a channel
                // Channel data is conversation data, which is saved automatically by bot framework SDK
            }
        }
    }

}
