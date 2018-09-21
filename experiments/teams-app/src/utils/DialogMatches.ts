// Regular Expressions and intent strings for Dialogs
// tslint:disable-next-line:variable-name
export const DialogMatches = {
    // *************************** BEGINNING OF EXAMPLES ***************************
    ResetUserStateDialogMatch: /^reset$/i,
    VSTSAPICallDialogMatch: /vsts api call/i,
    VSTS_Auth_Validate_User_Dialog_Intent: "VSTS_Auth_Validate_User_Dialog_Intent",
    VSTSLogInDialogMatch: /log ?in/i,
    GetLastDialogUsedDialogMatch: /last dialog/i,
    HelloDialogMatch: /hello/i,
    HelloDialogMatch2: /hi/i,
    HelpDialogMatch: /help/i,
    HeroCardDialogMatch: /hero card/i,
    MessageBackReceiverDialogMatch: /incoming message from messageBack button/i,
    MultiDialogMatch: /multi dialog 1/i,
    MultiDialog2Match: /multi dialog 2/i,
    O365ConnectorCardActionsDialogMatch: /connector card actions(.*)/i,
    O365ConnectorCardDialogMatch: /connector card(.*)/i,
    ThumbnailCardDialogMatch: /thumbnail card/i,
    TimezoneDialogMatch: /timezone/i,
    BeginDialogFlowDialogMatch: /dialog flow/i,
    ConstructorArgsDialogMatch: /constructor args/i,
    ListNamesDialogMatch: /names/i,
    Luis_Recognizer_Nat_Language_Dialog_Intent: "builtin.intent.alarm.set_alarm",
    Luis_Recognizer_Nat_Language_Dialog_2_Intent: "builtin.intent.alarm.delete_alarm",
    PromptDialogMatch: /prompt/i,
    QuizFullDialogMatch: /quiz/i,
    QuizQ1DialogMatch: /quiz question 1/i,
    QuizQ2DialogMatch: /quiz question 2/i,
    QuizQ3DialogMatch: /quiz question 3/i,
    AtMentionDialogMatch: /at(?:-| )?mention/i,
    ChannelDataDialogMatch: /channel data/i,
    DeeplinkDialogMatch: /deeplink/i,
    FetchRosterDialogMatch: /roster/i,
    FetchTeamInfoDialogMatch: /team info/i,
    ProactiveMsgTo1to1DialogMatch: /send (?:a )?message to (?:1:1|1 to 1)/i,
    ProactiveMsgToChannelDialogMatch: /send (?:a )?message to(?: the)?(.*?)(?:channel)?$/i,
    UpdateCardMsgDialogMatch: /update card message/i,
    UpdateCardMsgSetupDialogMatch: /setup card message/i,
    UpdateTextMsgDialogMatch: /update text message/i,
    UpdateTextMsgSetupDialogMatch: /setup text message/i,
    NotifyDialogMatch: /notify/i,
    PopUpSignInDialogMatch: /signin/i,
    // *************************** END OF EXAMPLES *********************************

    // Add regex or string intent matches for dialogs

};
