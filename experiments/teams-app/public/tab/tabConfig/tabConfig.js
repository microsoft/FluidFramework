var microsoftTeams;

// Set up the tab and stuff.
$(document).ready(function () {
    microsoftTeams.initialize();
    microsoftTeams.settings.registerOnSaveHandler(function (saveEvent) {
        microsoftTeams.settings.setSettings({
            // Note: If you sub a content URL in here, this will be the "home screen" of the bot
            suggestedDisplayName: "Flow View",
            contentUrl: "https://pragueteams.eu.prague.office-int.com",
            // contentUrl: "https://alfred.wu2.prague.office-int.com/loader/abttddac",
            entityId: "flowviewatdefault",
            websiteUrl: "https://pragueteams.eu.prague.office-int.com",
            // websiteUrl: "https://alfred.wu2.prague.office-int.com/loader/abttddac",
        });
      saveEvent.notifySuccess();
    });

    microsoftTeams.settings.setValidityState(true);
});

function createTabUrl() {
    return window.location.protocol + "//" + window.location.host + "/default";
}