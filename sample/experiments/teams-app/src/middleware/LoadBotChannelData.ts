import * as builder from "botbuilder";
import * as DialogUtils from "../utils/DialogUtils";
import { IBotChannelStorage } from "../storage/BotChannelStorage";

// Populates channelData property in session with channel data
// Channel data is specific to a Microsoft Teams channel for messages in channel context,
// for 1:1 messages it is the same as conversationData.
export class LoadBotChannelData implements builder.IMiddlewareMap {

    constructor(
        private channelStorage: IBotChannelStorage,
    ) { }

    public readonly botbuilder = async (session: builder.Session, next: Function): Promise<void> => {
        try {
            if (this.channelStorage) {
                let channelStorageData: any = session;
                let channelId = DialogUtils.getChannelId(session.message);
                if (channelId) {
                    let data = await this.channelStorage.getData({ channelId : channelId });
                    channelStorageData.channelData = data.channelData || { };
                } else {
                    // In conversations not in channel context, the conversation data is the channel data
                    channelStorageData.channelData = session.conversationData;
                }
            }
        } catch (e) {
            // console.log(e);
        }
        next();
    }

}
