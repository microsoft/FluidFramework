import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
let config = require("config");
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class QuizQ1Dialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let buttons = new Array<builder.CardAction>();
        buttons.push(builder.CardAction.imBack(session, "y_e_s", Strings.game_button_yes));
        buttons.push(builder.CardAction.imBack(session, "n_o", Strings.game_button_no));

        let newCard = new builder.HeroCard(session)
            .title(Strings.default_title)
            .subtitle(Strings.default_subtitle)
            .text(Strings.quiz_choose)
            .images([
                new builder.CardImage(session)
                    .url(config.get("app.baseUri") + "/assets/computer_person.jpg")
                    .alt(session.gettext(Strings.img_default)),
            ])
            .buttons(buttons);

        let msg = new builder.Message(session)
            .addAttachment(newCard);

        builder.Prompts.choice(session, msg, ["y_e_s", "n_o"]);
    }

    private static async step2(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        if (args.response) {
            if (args.response.entity === "y_e_s") {
                session.send(Strings.quiz_right);
            } else {
                session.send(Strings.quiz_wrong);
            }
            session.endDialog();
        } else {
            session.endDialog(Strings.something_went_wrong);
        }
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.QuizQ1DialogId,
            DialogMatches.QuizQ1DialogMatch,
            [
                QuizQ1Dialog.step1,
                QuizQ1Dialog.step2,
            ],
        );
    }
}
