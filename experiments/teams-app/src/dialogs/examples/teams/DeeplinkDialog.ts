import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as config from "config";
import * as querystring from "querystring";
import { isMessageFromChannel } from "../../../utils/DialogUtils";

export class DeeplinkDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let buttons = new Array<builder.CardAction>();

        if (isMessageFromChannel(session.message)) {
            // create button to deep link to the configurable channel tab - configurable channel tab must have been added for this to work
            // pattern for configurable channel tab deep link:
            // https://teams.microsoft.com/l/entity/APP_ID/ENTITY_ID?webUrl=ENTITY_WEB_URL&label=<entityLabel>&context=CONTEXT
            // APP_ID is the appId assigned in the manifest
            // ENTITY_ID is the entityId that is set for that channel tab when your config page creates it
            // ENTITY_WEB_URL is a url that is opened in a browswer on a mobile device if this url is opened on a mobile device
            // CONTEXT is a url encoded json object with a channelId parameter inside of it
            let appId = config.get("app.appId");
            let configTabEntityId = "test123";
            let queryParams = querystring.stringify({ context: "{\"channelId\":\"" + session.message.sourceEvent.channel.id + "\"}" });
            let configTabHardCodedUrl = "https://teams.microsoft.com/l/entity/" + appId + "/" + configTabEntityId + "?" + queryParams;
            buttons.push(builder.CardAction.openUrl(session, configTabHardCodedUrl, Strings.open_configurable_tab));
        }

        // create a button to deep link to the static tab located in the 1:1 chat with the bot
        // pattern for static tab deep link:
        // (at a minimum to get to the static tab)
        // https://teams.microsoft.com/l/entity/28:BOT_ID/ENTITY_ID?conversationType=chat

        // (for sending data to that tab) - look at the HelpDialog for an example
        // https://teams.microsoft.com/l/entity/28:BOT_ID/ENTITY_ID?conversationType=chat&context=CONTEXT

        // BOT_ID is the bot id that comes from your bot registration with 28: added to the front
        // ENTITY_ID is the entityId that is set for that static tab in the manifest
        // CONTEXT is a url encoded json object with a subEntityId parameter inside of it – this is how you can pass data to your static tab
        // e.g. %7B%22subEntityId%22%3A%22SUB_ENTITY_ID_DATA%22%7D
        let botId = "28:" + config.get("bot.botId");
        let staticTabEntityId = "1on1test123"; // this comes from the manifest file
        let queryParams = querystring.stringify(
            {
                conversationType: "chat",
                context: JSON.stringify({ subEntityId: "stuff" }),
            },
        );
        let staticTabHardCodedUrl = "https://teams.microsoft.com/l/entity/" + botId + "/" + staticTabEntityId + "?" + queryParams;
        buttons.push(builder.CardAction.openUrl(session, staticTabHardCodedUrl, Strings.open_static_tab));

        let newCard = new builder.HeroCard(session)
            .text(Strings.deeplink_card_text, staticTabHardCodedUrl)
            .buttons(buttons);

        session.send(new builder.Message(session)
            .addAttachment(newCard));

        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.DeeplinkDialogId,
            DialogMatches.DeeplinkDialogMatch,
            DeeplinkDialog.step1,
        );
    }
}
