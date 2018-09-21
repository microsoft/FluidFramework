import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as config from "config";

// Demonstrates using a signin action to show a login page in a popup
export class PopupSignInDialog extends TriggerActionDialog {

    private static async sendPopupSigninCard(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let popUpUrl = config.get("app.baseUri") + "/tab/tabConfig/popUpSignin.html?height=400&width=400";
        session.send(
            new builder.Message(session).addAttachment(
                new builder.HeroCard(session)
                    .title(Strings.popupsignin_card_title)
                    .buttons([
                        new builder.CardAction(session)
                            .type("signin")
                            .title(Strings.popupsignin_button_title)
                            .value(popUpUrl)])));
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.PopupSignInDialogId,
            DialogMatches.PopUpSignInDialogMatch,
            PopupSignInDialog.sendPopupSigninCard,
        );
    }
}
