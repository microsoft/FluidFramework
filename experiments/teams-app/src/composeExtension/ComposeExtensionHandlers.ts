import * as builder from "botbuilder";
import * as teams from "botbuilder-teams";
import * as request from "request";
import { loadSessionAsync } from "../utils/DialogUtils";
import * as config from "config";
import { Strings } from "../locale/locale";

const searchApiUrlFormat = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=[keyword]&srlimit=[limit]&sroffset=[offset]&format=json";
const imageApiUrlFormat = "https://en.wikipedia.org/w/api.php?action=query&formatversion=2&format=json&prop=pageimages&piprop=thumbnail&pithumbsize=250&titles=[title]";

export class ComposeExtensionHandlers {

    // this function returns a handler that will handle all interactions with the compose extension
    // in the compose extension search flyout
    public static getOnQueryHandler(bot: builder.UniversalBot): (event: builder.IEvent, query: teams.ComposeExtensionQuery, callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void) => void {
        return async function (
            event: builder.IEvent,
            query: teams.ComposeExtensionQuery,
            callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void,
        ): Promise<void>
        {
            // get the parameters that were passed into the compose extension
            let manifestInitialRun = "initialRun";
            let manifestParameterName = "query";
            let initialRunParameter = getQueryParameterByName(query, manifestInitialRun);
            // NOTE: make sure to not enter special characters that would break a regular expression
            // due to the logic that is used later
            let queryParameter = getQueryParameterByName(query, manifestParameterName);

            // validate that one of the two expected inputs was given
            if (!initialRunParameter && !queryParameter) {
                callback(new Error("Parameter mismatch in manifest"), null, 500);
                return;
            }

            let session = await loadSessionAsync(bot, event);

            if (!session.userData) {
                let response = teams.ComposeExtensionResponse.message()
                    .text("ERROR: No user data")
                    .toResponse();
                callback(null, response, 200);
                return;
            }

            /**
             * Below are the checks for various states that may occur
             * Note that the order of many of these blocks of code do matter
             */

            // situation where the incoming payload was received from the config popup
            if (query.state) {
                parseSettingsAndSave(query.state, session);

                // need to keep going to return a response so do not return here

                // these variables are changed so if the word 'setting' kicked off the compose extension,
                // then the word setting will not retrigger the config experience
                queryParameter = "";
                initialRunParameter = "true";
            }

            // this is a sitaution where the user's preferences have not been set up yet
            if (!session.userData.composeExtensionCardType) {
                let configResponse = getConfigResponse();
                callback(null, configResponse, 200);
                return;
            }

            // this is the situation where the user has entered the word 'reset' and wants
            // to clear his/her settings
            // resetKeyword for English is "reset"
            let resetKeyword = session.gettext(Strings.compose_extension_reset_keyword);
            if (queryParameter.toLowerCase() === resetKeyword.toLowerCase()) {
                delete session.userData.composeExtensionCardType;
                // this line is used to save the state for later use by the compose extension
                session.save().sendBatch();

                let resetResponse = teams.ComposeExtensionResponse.message()
                    .text(session.gettext(Strings.compose_extension_reset_message))
                    .toResponse();
                callback(null, resetResponse, 200);
                return;
            }

            // this is the situation where the user has entered "setting" or "settings" in order
            // to repromt the config experience
            // keywords for English are "setting" and "settings"
            let settingKeyword = session.gettext(Strings.compose_extension_setting_keyword);
            let settingsKeyword = session.gettext(Strings.compose_extension_settings_keyword);
            if (
                queryParameter.toLowerCase() === settingKeyword.toLowerCase() ||
                queryParameter.toLowerCase() === settingsKeyword.toLowerCase()
            )
            {
                let configResponse = getConfigResponse();
                callback(null, configResponse, 200);
                return;
            }

            // this is the situation where the user in on the initial run of the compose extension
            // e.g. when the user first goes to the compose extension and the search bar is still blank
            // in order to get the compose extension to run the initial run, the setting "initialRun": true
            // must be set in the manifest for the compose extension
            if (initialRunParameter) {
                let directionsResponse = teams.ComposeExtensionResponse.message()
                    .text(session.gettext(Strings.compose_extension_directions))
                    .toResponse();
                callback(null, directionsResponse, 200);
                return;
            }

            /**
             * Below here is simply the logic to call the Wikipedia API and create the response for
             * a query; the general flow is to call the Wikipedia API for the query and then call the
             * Wikipedia API for each entry for the query to see if that entry has an image; in order
             * to get the asynchronous sections handled, an array of Promises for cards is used; each
             * Promise is resolved when it is discovered if an image exists for that entry; once all
             * of the Promises are resolved, the response is sent back to Teams
             */

            let searchApiUrl = searchApiUrlFormat.replace("[keyword]", queryParameter);
            searchApiUrl = searchApiUrl.replace("[limit]", query.queryOptions.count + "");
            searchApiUrl = searchApiUrl.replace("[offset]", query.queryOptions.skip + "");
            searchApiUrl = encodeURI(searchApiUrl);

            // call Wikipedia API to search
            request(searchApiUrl, (error, res, body) => {
                let wikiResults: any = JSON.parse(body).query.search;
                let promisesOfCardsAsAttachments = new Array<Promise<teams.ComposeExtensionAttachment>>();

                // enumerate search results and build Promises for cards for response
                wikiResults.forEach((wikiResult) => {
                    // a separate API call to Wikipedia is needed to fetch the page image, if it exists
                    let imageApiUrl = imageApiUrlFormat.replace("[title]", encodeURI(wikiResult.title));
                    let cardPromise = new Promise<teams.ComposeExtensionAttachment>((resolve, reject) => {
                        request(imageApiUrl, (error2, res2, body2) => {
                            // parse image url
                            if (!error2) {
                                let imageUrl = null;
                                let pages: [any] = JSON.parse(body2).query.pages;
                                if (pages && pages.length > 0 && pages[0].thumbnail) {
                                    imageUrl = pages[0].thumbnail.source;
                                } else {
                                    // no image so use default Wikipedia image
                                    imageUrl = "https://upload.wikimedia.org/wikipedia/commons/d/de/Wikipedia_Logo_1.0.png";
                                }

                                // highlight matched keyword
                                let highlightedTitle = wikiResult.title;
                                if (queryParameter) {
                                    let matches = highlightedTitle.match(new RegExp(queryParameter, "gi"));
                                    if (matches && matches.length > 0) {
                                        highlightedTitle = highlightedTitle.replace(new RegExp(queryParameter, "gi"), "<b>" + matches[0] + "</b>");
                                    }
                                }

                                // make title into a link
                                highlightedTitle = "<a href=\"https://en.wikipedia.org/wiki/" + encodeURI(wikiResult.title) + "\" target=\"_blank\">" + highlightedTitle + "</a>";

                                let cardText = wikiResult.snippet + " ...";

                                // create the card itself and the preview card based upon the information

                                // HeroCard extends ThumbnailCard so we can use ThumbnailCard as the overarching type
                                let card: builder.ThumbnailCard = null;
                                // check user preference for which type of card to create
                                if (session.userData.composeExtensionCardType === "thumbnail") {
                                    card = new builder.ThumbnailCard();
                                } else {
                                    // at this point session.userData.composeExtensionCardType === "hero"
                                    card = new builder.HeroCard();
                                }
                                card.title(highlightedTitle)
                                    .text(cardText)
                                    .images([new builder.CardImage().url(imageUrl)]);

                                // build the preview card that will show in the search results
                                // Note: this is only needed if you want the cards in the search results to look
                                // different from what is placed in the compose box
                                let previewCard = new builder.ThumbnailCard()
                                    .title(highlightedTitle)
                                    .text(cardText)
                                    .images([new builder.CardImage().url(imageUrl)]);

                                let cardAsAttachment: teams.ComposeExtensionAttachment = card.toAttachment();
                                // add preview card to the response card
                                cardAsAttachment.preview = previewCard.toAttachment();

                                // resolve this Promise for a card once all of the information is in place
                                resolve(cardAsAttachment);
                            }
                        });
                    });

                    promisesOfCardsAsAttachments.push(cardPromise);
                });

                // once all of the Promises for cards are resolved, then send the respone back to Teams
                Promise.all(promisesOfCardsAsAttachments).then((cardsAsAttachments) =>
                {
                    let responseObject = teams.ComposeExtensionResponse.result("list");
                    let response = responseObject.attachments(cardsAsAttachments).toResponse();
                    callback(null, response, 200);
                });
            });
        };
    }

    /**
     * The two functions below return handlers for interacting with the settings option located at
     * the three dots when viewing the list of compose extensions
     * Note: to get the settings option to show up for these three dots, "canUpdateConfiguration": true
     * must be set in the manifest for the compose extension
     */

    // this function returns a handler which is used to return the config url to be opened in
    // the settings popup
    public static getOnQuerySettingsUrlHandler(): (event: builder.IEvent, query: teams.ComposeExtensionQuery, callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void) => void {
        return async function (
            event: builder.IEvent,
            query: teams.ComposeExtensionQuery,
            callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void,
        ): Promise<void>
        {
            let configResponse = getConfigResponse();
            callback(null, configResponse, 200);
        };
    }

    // this function returns a handler which is used to accept the returned state when the settings popup
    // initialized in the onQuerySettingsUrl handler (see above) is closed
    public static getOnSettingsUpdateHandler(bot: builder.UniversalBot): (event: builder.IEvent, query: teams.ComposeExtensionQuery, callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void) => void {
        return async function (
            event: builder.IEvent,
            query: teams.ComposeExtensionQuery,
            callback: (err: Error, result: teams.IComposeExtensionResponse, statusCode: number) => void,
        ): Promise<void>
        {
            let session = await loadSessionAsync(bot, event);
            parseSettingsAndSave(query.state, session);
            callback(null, null, 200);
        };
    }
}

// return the value of the specified query parameter
function getQueryParameterByName(query: teams.ComposeExtensionQuery, name: string): string {
    let matchingParams = (query.parameters || []).filter(p => p.name === name);
    return matchingParams.length ? matchingParams[0].value : "";
}

// used to parse the user preferences from the state and save them for later use
function parseSettingsAndSave(state: any, session: builder.Session): void {
    // query.state is parsed because its value is a string of a JSON object
    // this state is set in src/pages/ComposeExtensionSettingsPopUp.ts
    let settingsState = JSON.parse(state);
    if (settingsState.cardType) {
        session.userData.composeExtensionCardType = settingsState.cardType;
        // this line is used to save the state for later use by the compose extension
        session.save().sendBatch();
    }
}

// create a response to prompt for a configuration
function getConfigResponse(): teams.IComposeExtensionResponse {
    // the width and height parameters are optional, but will be used to try and create a popup of that size
    // if that size popup cannot be created, as in this example, then Teams will create the largest allowed popup
    let hardCodedUrl = config.get("app.baseUri") + "/composeExtensionSettings?width=5000&height=5000";
    let response = teams.ComposeExtensionResponse.config().actions([
        builder.CardAction.openUrl(null, hardCodedUrl, "Config"),
    ]).toResponse();
    return response;
}
