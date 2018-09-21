import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class ResetUserStateDialog extends TriggerActionDialog {

    private static async resetUserState(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        delete session.userData.vstsAuth;
        delete session.userData.aadObjectId;

        session.clearDialogStack();

        session.send(Strings.reset_complete);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.ResetUserStateDialogId,
            DialogMatches.ResetUserStateDialogMatch,
            ResetUserStateDialog.resetUserState,
        );
    }
}
