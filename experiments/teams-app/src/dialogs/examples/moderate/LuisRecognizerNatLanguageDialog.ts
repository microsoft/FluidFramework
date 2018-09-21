import * as builder from "botbuilder";
import { MultiTriggerActionDialog } from "../../../utils/MultiTriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class LuisRecognizerNatLanguageDialog extends MultiTriggerActionDialog {

    private static async setAlarmIntent(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.set_alarm_msg);
        session.endDialog();
    }

    private static async deleteAlarmIntent(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.delete_alarm_msg);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            [
                {
                    dialogId: DialogIds.LuisRecognizerNatLanguageDialogId,
                    match: DialogMatches.Luis_Recognizer_Nat_Language_Dialog_Intent,
                    action: LuisRecognizerNatLanguageDialog.setAlarmIntent,
                },
                {
                    dialogId: DialogIds.LuisRecognizerNatLanguageDialog2Id,
                    match: DialogMatches.Luis_Recognizer_Nat_Language_Dialog_2_Intent,
                    action: LuisRecognizerNatLanguageDialog.deleteAlarmIntent,
                },
            ],
        );
    }
}
