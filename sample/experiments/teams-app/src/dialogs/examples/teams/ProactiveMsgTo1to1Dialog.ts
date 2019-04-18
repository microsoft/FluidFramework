import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { loadSessionAsync } from "../../../utils/DialogUtils";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class ProactiveMsgTo1to1Dialog extends TriggerActionDialog {

    private static async send1to1Msg(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        // casting to keep away typescript error
        let msgAddress = (session.message.address as builder.IChatConnectorAddress);
        let msgServiceUrl = msgAddress.serviceUrl;

        // to send a proactive message to a one to one chat create the address, but leave out the conversation id
        let newAddress = {
            channelId: "msteams",
            user: { id: session.message.address.user.id },
            channelData: {
                tenant: {
                    id: session.message.sourceEvent.tenant.id,
                },
            },
            bot: {
                id: session.message.address.bot.id,
                // The bot's name can be used, but is not necessary
                // name: session.message.address.bot.name,
            },
            serviceUrl: msgServiceUrl,
            useAuth: true,
        };

        session.connector.startConversation(newAddress, async (err, resultAddress) => {
            if (!err) {
                // create a new event based on the incoming message, but change
                // the address to be the new result address
                // this is done so the new session has the same locale setting as the original
                // message
                let createdEvent = { ...session.message, address: resultAddress };
                // using this template and base trigger dialog, the bot is always present in args.constructorArgs.bot
                let sessionFor1to1 = await loadSessionAsync(args.constructorArgs.bot, createdEvent);
                sessionFor1to1.beginDialog(DialogIds.HelloDialogId);

                // if you wish to only send one message rather than starting a dialog, you can
                // skip the three steps above (comment them out), not create a new session,
                // and run the commented out section below

                // let proactiveMsg = new builder.Message(session)
                //     .address(resultAddress)
                //     .text(Strings.proactive_msg_one_to_one);
                // session.send(proactiveMsg);

                session.send(Strings.one_to_one_message_sent);
            } else {
                session.error(err);
            }
            session.endDialog();
        });
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.ProactiveMsgTo1to1DialogId,
            DialogMatches.ProactiveMsgTo1to1DialogMatch,

            ProactiveMsgTo1to1Dialog.send1to1Msg,

            // Below is another way to send a direct 1:1 message.  It is limited in that it does not work with the
            // automatic localization and multiple languages system
            // To Use: comment out the function directly above, Start1to1TrigDialog.send1to1Msg,
            // uncomment the function below

            // async (session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void) => {
            //     // casting to keep away typescript error
            //     let msgAddress = (session.message.address as builder.IChatConnectorAddress);
            //     let msgServiceUrl = msgAddress.serviceUrl;

            //     let address = {
            //         channelId: "msteams",
            //         user: { id: session.message.address.user.id },
            //         channelData: {
            //             tenant: {
            //                 id: session.message.sourceEvent.tenant.id,
            //             },
            //         },
            //         bot: {
            //             id: session.message.address.bot.id,
            //             // The bot's name can be used, but is not necessary
            //             // name: session.message.address.bot.name,
            //         },
            //         serviceUrl: msgServiceUrl,
            //         useAuth: true,
            //     };

            //     // this does not currently work with the localization and multiple languages system
            //     bot.beginDialog(address, DialogIds.TestTrigDialogId);

            //     session.send(Strings.one_to_one_message_sent);
            //     session.endDialog();
            // },
        );
    }
}
