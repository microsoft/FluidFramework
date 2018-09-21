import * as express from "express";
import { DialogMatches } from "../utils/DialogMatches";

export class AllCommandsTab {

    public static getRequestHandler(): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            try {
                let htmlPage = `<!DOCTYPE html>
                    <html>
                    <head>
                        <title>Bot Info</title>
                        <meta charset="utf-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <script src='https://statics.teams.microsoft.com/sdk/v1.0/js/MicrosoftTeams.min.js'></script>
                        <script src='https://code.jquery.com/jquery-1.11.3.min.js'></script>
                    </head>

                    <body>
                    <p>`;

                let allCommands = "";
                for (let key in DialogMatches) {
                    if (DialogMatches.hasOwnProperty(key)) {
                        let currRegEx = DialogMatches[key].toString();
                        let strippedRegEx = currRegEx.replace(/^\//, "").replace(/\/i$/, "");
                        // this check is to make sure and not show intents
                        if (strippedRegEx.indexOf("_") === -1) {
                            allCommands += strippedRegEx + "<br>";
                        }
                    }
                }
                htmlPage += allCommands;

                htmlPage += `</p>
                    </body>
                    </html>`;

                res.send(htmlPage);
            } catch (e) {
                res.send(`<html>
                    <body>
                    <p>
                        Sorry. There was an error.
                    </p>
                    <br>
                    <img src="/tab/error_generic.png" alt="default image" />
                    </body>
                    </html>`);
            }
        };
    }
}
