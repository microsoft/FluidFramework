import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class VSTSAuthValidateUserDialog extends TriggerActionDialog {

    private static async promptForValidationNumber(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        builder.Prompts.text(session, Strings.prompt_for_validation_number);
    }

    private static async validateInputNumber(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let userEnteredNumber = args.response.trim();
        let validationNumber = session.userData.vstsAuth.randomValidationNumber;
        if (userEnteredNumber === validationNumber) {
            session.userData.vstsAuth.isValidated = true;
            session.send(Strings.successfully_logged_in);
            session.endDialog();
        } else {
            session.send(Strings.error_validating_user);
            session.beginDialog(DialogIds.VSTSLogInDialogId);
        }
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.VSTSAuthValidateUserDialogId,
            DialogMatches.VSTS_Auth_Validate_User_Dialog_Intent,
            [
                VSTSAuthValidateUserDialog.promptForValidationNumber,
                VSTSAuthValidateUserDialog.validateInputNumber,
            ],
        );
    }
}
