/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var microsoftTeams;

// Set up the tab and stuff.
$(document).ready(function () {
    microsoftTeams.initialize();
    microsoftTeams.settings.registerOnSaveHandler(function (saveEvent) {
        microsoftTeams.settings.setSettings({
            // Note: If you sub a content URL in here, this will be the "home screen" of the bot
            suggestedDisplayName: "Flow View",
            contentUrl: "https://alfred.wu2.prague.office-int.com/sharedText/abttddac",
            entityId: "flowviewatdefault",
            websiteUrl: "https://alfred.wu2.prague.office-int.com/sharedText/abttddac",
        });
      saveEvent.notifySuccess();
    });

    microsoftTeams.settings.setValidityState(true);
});

function createTabUrl() {
    return window.location.protocol + "//" + window.location.host + "/default";
}
