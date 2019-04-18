import * as builder from "botbuilder";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { MultiTriggerActionDialog } from "../../../utils/MultiTriggerActionDialog";
import { Strings } from "../../../locale/locale";

export class MultiDialog extends MultiTriggerActionDialog {

    private static async test1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.multi_dialog_1);
        session.endDialog();
    }

    private static async test2(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.multi_dialog_2);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            [
                {
                    dialogId: DialogIds.MultiDialogId,
                    match: DialogMatches.MultiDialogMatch,
                    action: MultiDialog.test1,
                },
                {
                    dialogId: DialogIds.MultiDialog2Id,
                    match: DialogMatches.MultiDialog2Match,
                    action: MultiDialog.test2,
                },
            ],
        );
    }
}
