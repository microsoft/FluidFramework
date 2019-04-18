import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class MessageBackReceiverDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.messageBack_receiver_msg);
        session.send(Strings.messageBack_receiver_incoming_text, session.message.text);

        if (session.message && session.message.value) {
            let messageBackPayload = JSON.stringify(session.message.value);
            session.send(Strings.messageBack_receiver_payload, messageBackPayload);
        } else {
            session.send(Strings.messageBack_receiver_no_payload);
        }

        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.MessageBackReceiverDialogId,
            DialogMatches.MessageBackReceiverDialogMatch,
            MessageBackReceiverDialog.step1,
        );
    }
}
