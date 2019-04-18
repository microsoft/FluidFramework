import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";

export class O365ConnectorCardDialog extends TriggerActionDialog {

    private static async step1(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        // get the input number for the example to show if the user passed it into the command - e.g. 'show connector card 2'
        let inputNumber = args.intent.matched[1].trim();

        let msg = new builder.Message(session);
        let o365Card: any = {};
        o365Card.contentType = "application/vnd.microsoft.teams.card.o365connector";

        // this is the default example's content
        let o365ConnectorCardContent: any = {
            title: session.gettext(Strings.default_title),
            sections: [
                {
                    text: session.gettext(Strings.default_text) + "1",
                },
                {
                    text: session.gettext(Strings.default_text) + "2",
                },
            ],
        };

        o365Card.content = o365ConnectorCardContent;

        /**
         * Below are a few more examples of more complex connector cards
         * The default card's content will be overwritten if a different option is desired
         * and its number passed into the call to the bot
         *
         * To use: simply call 'show connector card 2' or 'show connector card 3'
         *
         * Note: these examples are just filled with demo data and that demo data is NOT using the localization system
         * as shown above
         *
         * Note: these examples are leveraging an actual JSON string as their input content - more examples can be found at
         * https://messagecardplayground.azurewebsites.net/ - it is recommended that the developer use the method
         * shown above in order to get the benefits of type checking from the teams.O365ConnectorCard interface
         */

        // Overwrite default card content if option 2 is desired
        if (inputNumber === "2") {
            o365Card.content = JSON.parse(`
                {
                    "themeColor": "fe9a13",
                    "sections": [
                        {
                            "title": "**New major event on omi10svr**",
                            "activityTitle": "Batch upload for TAX data on db-srv-hr1 aborted due to timeout. (ref324)",
                            "facts": [
                                {
                                    "name": "Receive Time",
                                    "value": "2016-05-30T16:50:02.503Z"
                                },
                                {
                                    "name": "Node",
                                    "value": "omi10svr"
                                },
                                {
                                    "name": "Category",
                                    "value": "job"
                                },
                                {
                                    "name": "Priority",
                                    "value": "medium"
                                }
                            ]
                        }
                    ]
                }
            `);
        }

        // Overwrite default card content if option 3 is desired
        if (inputNumber === "3") {
            o365Card.content = JSON.parse(`
                {
                    "summary": "Issue 176715375",
                    "themeColor": "0078D7",
                    "title": "Issue opened: Push notifications not working",
                    "sections": [
                        {
                            "activityTitle": "Miguel Garcie",
                            "activitySubtitle": "9/13/2016, 11:46am",
                            "activityImage": "http://connectorsdemo.azurewebsites.net/images/MSC12_Oscar_002.jpg",
                            "facts": [
                                {
                                    "name": "Repository:",
                                    "value": "mgarcia\\test"
                                },
                                {
                                    "name": "Issue #:",
                                    "value": "176715375"
                                }
                            ],
                            "text": "There is a problem with Push notifications, they don't seem to be picked up by the connector."
                        }
                    ]
                }
            `);
        }

        msg.addAttachment(o365Card);
        session.send(msg);
        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.O365ConnectorCardDialogId,
            DialogMatches.O365ConnectorCardDialogMatch,
            O365ConnectorCardDialog.step1,
        );
    }
}
