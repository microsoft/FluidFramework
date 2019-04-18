import * as builder from "botbuilder";
import { TriggerActionDialog } from "../../../utils/TriggerActionDialog";
import { DialogIds } from "../../../utils/DialogIds";
import { DialogMatches } from "../../../utils/DialogMatches";
import { Strings } from "../../../locale/locale";
import { VSTSAPI } from "../../../apis/VSTSAPI";

export class VSTSAPICallDialog extends TriggerActionDialog {

    private static async promptForWorkItemId(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        builder.Prompts.text(session, Strings.prompt_for_work_item_id);
    }

    private static async showWorkItem(session: builder.Session, args?: any | builder.IDialogResult<any>, next?: (args?: builder.IDialogResult<any>) => void): Promise<void> {
        let desiredWorkItemId = args.response.trim();
        let vstsAPI = new VSTSAPI();
        let body = await vstsAPI.getWorkItem(desiredWorkItemId, session);
        if (!body) {
            session.endDialog();
            // return is needed because endDialog does not quit out of function
            return;
        }

        // session.send, when given a template, will substitute values where
        // indicated in the string template
        session.send(Strings.title_of_work_item_template, body.value[0].fields["System.Title"]);
        session.send(Strings.get_html_info_for_work_item_template, body.value[0].url);

        let urlEncodedProject = encodeURIComponent(body.value[0].fields["System.TeamProject"]);
        let hardCodedUrl = "https://teamsbot.visualstudio.com/" + urlEncodedProject + "/_workitems?id=" + desiredWorkItemId + "&_a=edit";
        session.send(Strings.go_to_work_item_template, hardCodedUrl);

        session.endDialog();
    }

    constructor(
        bot: builder.UniversalBot,
    ) {
        super(bot,
            DialogIds.VSTSAPICallDialogId,
            DialogMatches.VSTSAPICallDialogMatch,
            [
                VSTSAPICallDialog.promptForWorkItemId,
                VSTSAPICallDialog.showWorkItem,
            ],
        );
    }
}
