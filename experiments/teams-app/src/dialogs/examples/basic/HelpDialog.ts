import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as config from "config";
import * as querystring from "querystring";

export class HelpDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let buttons = new Array<builder.CardAction>();
        let botId = "28:" + config.get("bot.botId");
        let staticTabEntityId = "1on1test123"; // this comes from the manifest file
        let queryParams = querystring.stringify(
            {
                conversationType: "chat",
                // context: "{\"subEntityId\":\"allCommands\"}",
                context: JSON.stringify({ subEntityId: "allCommands" }),
            },
        );

        // hardCodedUrl has url encoded {"subEntityId":"allCommands"} set as the context
        let staticTabHardCodedUrl = "https://teams.microsoft.com/l/entity/" + botId + "/" + staticTabEntityId + "?" + queryParams;
        buttons.push(builder.CardAction.openUrl(session, staticTabHardCodedUrl, Strings.all_commands_button));

        let newCard = new builder.HeroCard(session)
            .text(Strings.help_msg)
            .buttons(buttons);

        session.send(new builder.Message(session)
            .addAttachment(newCard));

        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.HelpDialogId,
            DialogMatches.HelpDialogMatch,
            HelpDialog.step1,
        );
    }
}
