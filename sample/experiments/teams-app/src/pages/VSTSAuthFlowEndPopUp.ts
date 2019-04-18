import * as express from "express";

export class VSTSAuthFlowEndPopUp {

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
                        <p>Auth Flow End</p>
                        <script>
                            var microsoftTeams;

                            $(document).ready(function () { 
                                microsoftTeams.initialize();
                            
                                microsoftTeams.authentication.notifySuccess('Success!!! You are now logged in to use the bot and the tab.');
                            });
                        </script>
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
