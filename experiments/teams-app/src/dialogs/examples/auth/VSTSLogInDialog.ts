import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
// import { VSTSTokenOAuth2API } from "../../../apis/VSTSTokenOAuth2API";
import { Strings } from "../../../locale/locale";
import * as config from "config";
import * as querystring from "querystring";

export class VSTSLogInDialog extends TriggerActionDialog {

    private static async sendAuthorizeMsg(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        // let url = VSTSTokenOAuth2API.getUserAuthorizationURL();

        // let newCard = new builder.SigninCard(session)
        //     .button(
        //         Strings.sign_in,
        //         url,
        //     )
        //     .text(Strings.default_text);

        let buttons = [];
        // buttons.push(builder.CardAction.openUrl(session, url, Strings.sign_in));
        let botId = "28:" + config.get("bot.botId");
        let staticTabEntityId = "1on1test123"; // this comes from the manifest file
        let queryParams = querystring.stringify(
            {
                conversationType: "chat",
                // context: "{\"subEntityId\":\"allCommands\"}",
                context: JSON.stringify({ subEntityId: "vstsAuth" }),
            },
        );
        let staticTabHardCodedUrl = "https://teams.microsoft.com/l/entity/" + botId + "/" + staticTabEntityId + "?" + queryParams;
        buttons.push(builder.CardAction.openUrl(session, staticTabHardCodedUrl, Strings.sign_in));

        let newCard = new builder.ThumbnailCard(session)
            .title(Strings.default_title)
            .subtitle(Strings.default_subtitle)
            .text(Strings.default_text)
            .images([
                new builder.CardImage(session)
                    .url(config.get("app.baseUri") + "/assets/computer_person.jpg")
                    .alt(Strings.img_default),
            ])
            .buttons(buttons);

        // Just for development to see what the session.message.address values are
        // session.send(encodeURIComponent(JSON.stringify(session.message.address)));

        session.endDialog(new builder.Message(session).addAttachment(newCard));
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.VSTSLogInDialogId,
            DialogMatches.VSTSLogInDialogMatch,
            VSTSLogInDialog.sendAuthorizeMsg,
        );
    }
}
