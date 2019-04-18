import * as express from "express";

export class VSTSAuthTab {

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
                        <p id="messageDisplay">Welcome to the Auth Page<br><br>Loading...</p>
                        <script>
                            var microsoftTeams;

                            $(document).ready(function () { 
                                microsoftTeams.initialize();
                                window.setTimeout(function() {
                                    microsoftTeams.authentication.authenticate({
                                        url: window.location.protocol + '//' + window.location.host + '/vstsAuthFlowStart',
                                        height: 5000,
                                        width: 5000,
                                        successCallback: (message) => {
                                            document.getElementById('messageDisplay').innerHTML = message;
                                        },
                                        failureCallback: (message) => {
                                            document.getElementById('messageDisplay').innerHTML = message;
                                        }
                                    });
                                }, 3000);
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
