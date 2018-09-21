import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class GetLastDialogUsedDialog extends TriggerActionDialog {

    private static async returnLastDialogUsed(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let msg = session.gettext(Strings.current_dialog_template, session.conversationData.currentDialogName);
        session.send(msg);
        session.conversationData.currentDialogName = DialogIds.GetLastDialogUsedDialogId;
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.GetLastDialogUsedDialogId,
            DialogMatches.GetLastDialogUsedDialogMatch,
            GetLastDialogUsedDialog.returnLastDialogUsed,
        );
    }
}
