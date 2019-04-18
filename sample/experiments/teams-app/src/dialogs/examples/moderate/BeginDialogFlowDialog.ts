import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogMatches } from "../../../utils/DialogMatches";
import { DialogIds } from "../../../utils/DialogIds";
import { Strings } from "../../../locale/locale";

export class BeginDialogFlowDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.step_1);
        next();
    }

    private static async step2(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.step_2);
        session.beginDialog(DialogIds.HelloDialogId);

        // IMPORTANT: within a waterfall step make sure you do not call anything after next(), beginDialog(), builder.Prompts, or any other built in function
        // that will start a new dialog
    }

    private static async step3(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.step_3);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.BeginDialogFlowDialogId,
            DialogMatches.BeginDialogFlowDialogMatch,
            [
                BeginDialogFlowDialog.step1,
                BeginDialogFlowDialog.step2,
                BeginDialogFlowDialog.step3,
            ],
        );
    }
}
