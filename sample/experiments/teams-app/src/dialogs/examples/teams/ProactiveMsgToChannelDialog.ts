import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { isMessageFromChannel, startReplyChainInChannel } from "../../../utils/DialogUtils";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as teams from "botbuilder-teams";

export class ProactiveMsgToChannelDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (!isMessageFromChannel(session.message)) {
            session.send(Strings.cmd_only_works_in_channel);
            session.endDialog();
            return;
        }

        let channelNameInput = args.intent.matched[1].trim();
        if (channelNameInput) {
            next({ response: channelNameInput });
        } else {
            builder.Prompts.text(session, Strings.choose_channel_prompt);
        }
    }

    private static async step2(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let inputChannelName = args.response.trim();

        // casting to keep away typescript error
        let teamsChatConnector = (session.connector as teams.TeamsChatConnector);
        let msgAddress = (session.message.address as builder.IChatConnectorAddress);
        let msgServiceUrl = msgAddress.serviceUrl;
        let teamId = session.message.sourceEvent.team.id;

        teamsChatConnector.fetchChannelList(
            msgServiceUrl,
            teamId,
            async (err, result) => {
                if (!err) {
                    let desiredChannelId = null;
                    for (let i = 0; i < result.length; i++) {
                        let currentChannelName = result[i].name;
                        // Do this change of name because the fetchChannelList call will return the General
                        // channel without a name - string of "General" channel's name needs to be localized
                        if (!currentChannelName) {
                            currentChannelName = session.gettext(Strings.general_channel_name);
                        }
                        if (inputChannelName.toUpperCase() === currentChannelName.toUpperCase()) {
                            desiredChannelId = result[i].id;
                            break;
                        }
                    }
                    if (!desiredChannelId) {
                        session.send(Strings.channel_choice_failure);
                        session.endDialog();
                        return;
                    }

                    let proactiveMsg = new builder.Message(session).text(Strings.proactive_channel_msg);
                    // send the first proactive message to a channel using this function in order to get the updated
                    // conversation.id in the address of the response
                    let replyChainAddress = await startReplyChainInChannel((session.connector as any), proactiveMsg, desiredChannelId);

                    // use this newly returned address with its updated conversation.id in order to send a proactive message
                    // as a reply to the first proactive message
                    let proactiveMsgInReplyChain = new builder.Message(session).text(Strings.proactive_msg_in_reply_chain).address(replyChainAddress);
                    session.send(proactiveMsgInReplyChain);

                    session.send(Strings.proactive_channel_msg_sent);
                    session.endDialog();
                } else {
                    session.endDialog(Strings.error_proactive_channel_msg);
                }
            },
        );
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.ProactiveMsgToChannelDialogId,
            DialogMatches.ProactiveMsgToChannelDialogMatch,
            [
                ProactiveMsgToChannelDialog.step1,
                ProactiveMsgToChannelDialog.step2,
            ],
        );
    }
}
