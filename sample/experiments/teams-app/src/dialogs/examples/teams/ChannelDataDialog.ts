import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import { ChannelData } from "../../../utils/ChannelData";

export class ChannelDataDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        /**
         * Currently, using the channel data works as follows:
         *
         * There is middleware, LoadBotChannelData, in src/Bot.ts that loads the channel data
         * on every incoming message - this allows you to get it with ChannelData.get(session)
         *
         * In order to update the channel data, though, (and this could be placed in middleware
         * if you so desired so that it would automatically happen with every outgoing message)
         * currently you must manually call await ChannelData.saveToStorage(...) - the choice
         * to not have it save automatically now was to save one less call to the database for
         * every outgoing message because the number of times we update the channelData is
         * relatively low
         */

        // this dialog can be used to show the differences of conversationData and channelData
        // in a 1:1 chat the two are the same
        // in a channel each reply chain has its own conversationData, but the channelData
        // is the same throughout every reply chain
        let channelData = ChannelData.get(session);
        if (!channelData.testNumb) {
            channelData.testNumb = 0;
        }
        channelData.testNumb++;

        if (!session.conversationData.testNumb) {
            session.conversationData.testNumb = 0;
        }
        session.conversationData.testNumb++;

        session.send(Strings.channel_data_testNumb, channelData.testNumb);
        session.send(Strings.conversation_data_testNumb, session.conversationData.testNumb);

        // the channelStorage field is set at the bot's creation in src/app.ts
        await ChannelData.saveToStorage(session, args.constructorArgs.bot.get("channelStorage"));

        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.ChannelDataDialogId,
            DialogMatches.ChannelDataDialogMatch, // /channel data/i,
            ChannelDataDialog.step1,
        );
    }
}
