import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class UpdateTextMsgDialog extends TriggerActionDialog {

    private static async updateTextMessage(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (session.conversationData.lastTextMessage) {
            let msg = new builder.Message(session)
                .address(session.conversationData.lastTextMessage)
                .text(Strings.updated_text_msg);

            session.connector.update(msg.toMessage(), (err, address) => {
                if (!err) {
                    // do not need to save the incoming address because Teams does not change it
                    session.send(Strings.updated_msg_confirmation);
                } else {
                    session.error(err);
                }
                session.endDialog();
            });
        } else {
            session.send(Strings.no_msg_to_update);
            session.endDialog();
        }
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.UpdateTextMsgDialogId,
            DialogMatches.UpdateTextMsgDialogMatch,
            UpdateTextMsgDialog.updateTextMessage,
        );
    }
}
