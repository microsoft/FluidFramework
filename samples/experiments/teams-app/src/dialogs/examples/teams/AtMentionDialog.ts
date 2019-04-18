import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as teams from "botbuilder-teams";

export class AtMentionDialog extends TriggerActionDialog {

    private static async atMentionUser(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let atMention: builder.IIdentity = {
            // name to display for at-mention
            name: session.message.address.user.name,
            // user id of person to at-mention
            id: session.message.address.user.id,
        };

        // because of the way .text and .addMentionToText work you, first, have to add the text to the message
        // then you can add the at-mention to the text
        let msg = new teams.TeamsMessage(session).text(Strings.at_mention);
        let msgWithAtMention = (msg as teams.TeamsMessage).addMentionToText(atMention);

        session.send(msgWithAtMention);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.AtMentionDialogId,
            DialogMatches.AtMentionDialogMatch,
            AtMentionDialog.atMentionUser,
        );
    }
}
