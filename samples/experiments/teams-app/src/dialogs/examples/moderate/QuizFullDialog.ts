import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class QuizFullDialog extends TriggerActionDialog {

    private static async send(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.beginDialog(DialogIds.QuizQ1DialogId, {});
    }

    private static async send2(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.beginDialog(DialogIds.QuizQ2DialogId, {});
    }

    private static async send3(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.beginDialog(DialogIds.QuizQ3DialogId, {});
    }

    private static async send4(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.quiz_completed);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.QuizFullDialogId,
            DialogMatches.QuizFullDialogMatch,
            [
                QuizFullDialog.send,
                QuizFullDialog.send2,
                QuizFullDialog.send3,
                QuizFullDialog.send4,
            ],
        );
    }
}
