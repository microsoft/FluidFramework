import * as builder from "botbuilder";
import { Strings } from "../locale/locale";
import { DialogIds } from "../utils/DialogIds";
// let config = require("config");

// *************************** BEGINNING OF EXAMPLES ***************************
import { ResetUserStateDialog } from "./examples/auth/ResetUserStateDialog";
import { VSTSAPICallDialog } from "./examples/auth/VSTSAPICallDialog";
import { VSTSAuthValidateUserDialog } from "./examples/auth/VSTSAuthValidateUserDialog";
import { VSTSLogInDialog } from "./examples/auth/VSTSLogInDialog";
import { GetLastDialogUsedDialog } from "./examples/basic/GetLastDialogUsedDialog";
import { HelloDialog } from "./examples/basic/HelloDialog";
import { HelpDialog } from "./examples/basic/HelpDialog";
import { HeroCardDialog } from "./examples/basic/HeroCardDialog";
import { MessageBackReceiverDialog } from "./examples/basic/MessageBackReceiverDialog";
import { MultiDialog } from "./examples/basic/MultiDialog";
import { O365ConnectorCardActionsDialog } from "./examples/basic/O365ConnectorCardActionsDialog";
import { O365ConnectorCardDialog } from "./examples/basic/O365ConnectorCardDialog";
import { ThumbnailCardDialog } from "./examples/basic/ThumbnailCardDialog";
import { TimezoneDialog } from "./examples/basic/TimezoneDialog";
import { BeginDialogFlowDialog } from "./examples/moderate/BeginDialogFlowDialog";
import { ConstructorArgsDialog } from "./examples/moderate/ConstructorArgsDialog";
import { ListNamesDialog } from "./examples/moderate/ListNamesDialog";
import { LuisRecognizerNatLanguageDialog } from "./examples/moderate/LuisRecognizerNatLanguageDialog";
import { PromptDialog } from "./examples/moderate/PromptDialog";
import { QuizFullDialog } from "./examples/moderate/QuizFullDialog";
import { QuizQ1Dialog } from "./examples/moderate/QuizQ1Dialog";
import { QuizQ2Dialog } from "./examples/moderate/QuizQ2Dialog";
import { QuizQ3Dialog } from "./examples/moderate/QuizQ3Dialog";
import { AtMentionDialog } from "./examples/teams/AtMentionDialog";
import { ChannelDataDialog } from "./examples/teams/ChannelDataDialog";
import { DeeplinkDialog } from "./examples/teams/DeeplinkDialog";
import { FetchRosterDialog } from "./examples/teams/FetchRosterDialog";
import { FetchTeamInfoDialog } from "./examples/teams/FetchTeamInfoDialog";
import { ProactiveMsgTo1to1Dialog } from "./examples/teams/ProactiveMsgTo1to1Dialog";
import { ProactiveMsgToChannelDialog } from "./examples/teams/ProactiveMsgToChannelDialog";
import { UpdateCardMsgDialog } from "./examples/teams/UpdateCardMsgDialog";
import { UpdateCardMsgSetupDialog } from "./examples/teams/UpdateCardMsgSetupDialog";
import { UpdateTextMsgDialog } from "./examples/teams/UpdateTextMsgDialog";
import { UpdateTextMsgSetupDialog } from "./examples/teams/UpdateTextMsgSetupDialog";
import { NotifyDialog } from "./examples/teams/NotifyDialog";
import { PopupSignInDialog } from "./examples/basic/PopupSignInDialog";
// *************************** END OF EXAMPLES *********************************

// Add imports for dialogs

// Main dialog that handles commands
export class RootDialog extends builder.IntentDialog {

    constructor(
        private bot: builder.UniversalBot,
    ) {
        super();
        this.onDefault((session) => { this._onDefault(session); });

        bot.dialog(DialogIds.RootDialogId, this);

        // Add LUIS recognizer for natural language processing
        // let luisEndpoint = config.get("luis.endpointUri");
        // if (luisEndpoint) {
        //     bot.recognizer(new builder.LuisRecognizer(luisEndpoint));
        // }
    }

    // Create the child dialogs and attach them to the bot
    public createChildDialogs(): void {
        let bot = this.bot;

        // *************************** BEGINNING OF EXAMPLES ***************************
        new ResetUserStateDialog(bot);
        new VSTSAPICallDialog(bot);
        new VSTSAuthValidateUserDialog(bot);
        new VSTSLogInDialog(bot);
        new GetLastDialogUsedDialog(bot);
        new HelloDialog(bot);
        new HelpDialog(bot);
        new HeroCardDialog(bot);
        new MessageBackReceiverDialog(bot);
        new MultiDialog(bot);
        new O365ConnectorCardActionsDialog(bot);
        new O365ConnectorCardDialog(bot);
        new ThumbnailCardDialog(bot);
        new TimezoneDialog(bot);
        new BeginDialogFlowDialog(bot);
        new ConstructorArgsDialog(bot, "12345");
        new ListNamesDialog(bot);
        new LuisRecognizerNatLanguageDialog(bot);
        new PromptDialog(bot);
        new QuizFullDialog(bot);
        new QuizQ1Dialog(bot);
        new QuizQ2Dialog(bot);
        new QuizQ3Dialog(bot);
        new AtMentionDialog(bot);
        new ChannelDataDialog(bot);
        new DeeplinkDialog(bot);
        new FetchRosterDialog(bot);
        new FetchTeamInfoDialog(bot);
        new ProactiveMsgTo1to1Dialog(bot);
        new ProactiveMsgToChannelDialog(bot);
        new UpdateCardMsgDialog(bot);
        new UpdateCardMsgSetupDialog(bot);
        new UpdateTextMsgDialog(bot);
        new UpdateTextMsgSetupDialog(bot);
        new NotifyDialog(bot);
        new PopupSignInDialog(bot);
        // *************************** END OF EXAMPLES *********************************

        // Add child dialogs

    }

    // Handle unrecognized input
    private _onDefault(session: builder.Session): void {
        session.conversationData.currentDialogName = DialogIds.RootDialogId;
        session.send(Strings.root_dialog_on_default);
    }
}
