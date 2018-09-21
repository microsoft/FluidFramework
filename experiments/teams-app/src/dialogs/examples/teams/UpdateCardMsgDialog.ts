import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as config from "config";

export class UpdateCardMsgDialog extends TriggerActionDialog {
    // update the card, if user has already setup the card message from below dialog file using update button click
    // microsoft-teams-sample-complete-node\src\dialogs\examples\teams\UpdateCardMsgSetupDialog.ts
    private static async updateCardMessage(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (session.message.replyToId)
        {
            let updateCardCounter = session.message.value.updateCounterKey;
            let messageBackButtonValue = JSON.stringify({ updateCounterKey: ++updateCardCounter });

            let messageBackButton = builder.CardAction.messageBack(session, messageBackButtonValue)
                .displayText(Strings.messageBack_button_display_text)
                .title(Strings.update_card_button)
                .text("update card message"); // This must be a string that routes to UpdateCardMsgDialog, which handles card updates

            let newCard = new builder.HeroCard(session)
                .title(Strings.updated_card_title, updateCardCounter)
                .subtitle(Strings.updated_card_subtitle)
                .text(Strings.default_text)
                .images([
                    new builder.CardImage(session)
                        .url(config.get("app.baseUri") + "/assets/computer_person.jpg")
                        .alt(session.gettext(Strings.img_default)),
                    ])
                .buttons([messageBackButton]);

            let addressOfMessageToUpdate = { ...session.message.address, id: session.message.replyToId };

            let msg = new builder.Message(session)
                .address(addressOfMessageToUpdate)
                .addAttachment(newCard);

            session.connector.update(msg.toMessage(), (err, address) => {
                if (!err) {
                    session.send(Strings.updated_msg_confirmation);
                } else {
                    session.send(Strings.update_card_error + err.message);
                }
                session.endDialog();
            });
        }
        else
        {
            session.send(Strings.no_msg_to_update);
            session.endDialog();
        }
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.UpdateCardMsgDialogId,
            DialogMatches.UpdateCardMsgDialogMatch,
            UpdateCardMsgDialog.updateCardMessage,
        );
    }
}
