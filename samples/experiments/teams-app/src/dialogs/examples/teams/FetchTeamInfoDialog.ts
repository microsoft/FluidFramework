import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { isMessageFromChannel } from "../../../utils/DialogUtils";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import * as teams from "botbuilder-teams";

export class FetchTeamInfoDialog extends TriggerActionDialog {

    private static async fetchTeamInfoPayload(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        // casting to keep away typescript errors
        let teamsChatConnector = (session.connector as teams.TeamsChatConnector);
        let msgAddress = (session.message.address as builder.IChatConnectorAddress);
        let msgServiceUrl = msgAddress.serviceUrl;

        // if a message is from a channel, use the team.id to fetch the roster
        if (!isMessageFromChannel(session.message))
        {
            session.send(Strings.teaminfo_notinchannel_error);
        }
        else
        {
            let teamId = session.message.sourceEvent.team.id;

            teamsChatConnector.fetchTeamInfo(msgServiceUrl, teamId,
                (err, result) => {
                    if (!err) {
                        session.send(FetchTeamInfoDialog.generateTableForTeamInfo(result));
                    } else {
                        session.send(Strings.teaminfo_error + err.message);
                    }
                },
            );
        }

        session.endDialog();
    }

    // Generate the team info data in table format
    private static generateTableForTeamInfo(teamDetails: teams.TeamInfo): string {
        if (teamDetails) {
            // Currently, aadGroupId is present but is not defined in the TeamInfo typings
            return `<table border='1'>
                        <tr><td> Team id </td><td>${teamDetails.id}</td></tr>
                        <tr><td> Team name </td><td>${teamDetails.name}</td></tr>
                        <tr><td> AAD group id </td><td>${(teamDetails as any).aadGroupId}</td><tr>
                    </table>`;
        }
        return "";
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.FetchTeamInfoDialogId,
            DialogMatches.FetchTeamInfoDialogMatch,
            FetchTeamInfoDialog.fetchTeamInfoPayload,
        );
    }
}
