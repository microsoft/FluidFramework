/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

        let address = session.message.text.split("deeplink ")[1];

        let app = address.split(";")[0];
        let id = address.split(";")[1];

        let botId = "28:" + config.get("bot.botId");
        let staticTabEntityId = app;
        if (isMessageFromChannel(session.message)) {
            let appId = config.get("app.appId");
            let queryParams = querystring.stringify({
                 context: JSON.stringify({
                        channelId: session.message.sourceEvent.channel.id,
                        subEntityId: id,
                    }),
                },
            );
            let configTabHardCodedUrl = "https://teams.microsoft.com/l/entity/" + appId + "/" + staticTabEntityId + "?" + queryParams;
            buttons.push(builder.CardAction.openUrl(session, configTabHardCodedUrl, Strings.open_configurable_tab));
        }

        let queryParams = querystring.stringify(
            {
                conversationType: "chat",
                context: JSON.stringify({ subEntityId: id }),
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
