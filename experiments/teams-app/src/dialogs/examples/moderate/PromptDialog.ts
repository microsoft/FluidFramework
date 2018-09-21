import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class PromptDialog extends TriggerActionDialog {

    private static async promptForName(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        builder.Prompts.text(session, Strings.game_name_prompt);
    }

    private static async promptForChoice(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let msg = session.gettext(Strings.game_name_response_template, args.response);
        session.send(msg);
        let buttonText = session.gettext(Strings.game_button_text);
        builder.Prompts.choice(session, Strings.game_button_prompt, buttonText, { listStyle: builder.ListStyle["button"] });
    }

    private static async promptForCorrectChoice(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let choiceText = session.gettext(Strings.game_button_response_template, args.response.entity);
        let buttonText = session.gettext(Strings.game_button_yes) + "|" + session.gettext(Strings.game_button_no);
        builder.Prompts.choice(session, choiceText, buttonText, { listStyle: builder.ListStyle["button"] });
    }

    private static async showResult(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (args.response.entity === session.gettext(Strings.game_button_yes)) {
            session.send(Strings.game_success);
        } else {
            session.send(Strings.game_failure_funny);
        }
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.PromptDialogId,
            DialogMatches.PromptDialogMatch,
            [
                PromptDialog.promptForName,
                PromptDialog.promptForChoice,
                PromptDialog.promptForCorrectChoice,
                PromptDialog.showResult,
            ],
        );
    }
}
