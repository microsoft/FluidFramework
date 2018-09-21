import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class TimezoneDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        // check to ensure all expectied fields are present
        if (!session.message || !session.message.timestamp || !session.message.localTimestamp) {
            session.send(Strings.timezone_error_msg);
            session.endDialog();
            return;
        }

        session.send(Strings.timezone_msg, session.message.timestamp, session.message.localTimestamp);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.TimezoneDialogId,
            DialogMatches.TimezoneDialogMatch,
            TimezoneDialog.step1,
        );
    }
}
