import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class ConstructorArgsDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        session.send(Strings.constructor_args_template, args.constructorArgs.inputString);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
        inputString: string,
    ) {
        super(bot,
            DialogIds.ConstructorArgsDialogId,
            DialogMatches.ConstructorArgsDialogMatch,
            ConstructorArgsDialog.step1,
            { inputString: inputString },
        );
    }
}
