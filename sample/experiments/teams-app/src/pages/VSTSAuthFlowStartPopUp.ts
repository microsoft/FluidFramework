import * as express from "express";
import { VSTSTokenOAuth2API } from "../apis/VSTSTokenOAuth2API";

export class VSTSAuthFlowStartPopUp {

    public static getRequestHandler(): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            try {
                let htmlPage = `<!DOCTYPE html>
                    <html>
                    <head>
                        <title>Bot Info</title>
                        <meta charset="utf-8" />
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <script src='https://code.jquery.com/jquery-1.11.3.min.js'></script>
                    </head>

                    <body>
                        <p>Auth Flow Start</p>
                        <script>
                            $(document).ready(function () { 
                                window.location = "${ VSTSTokenOAuth2API.getUserAuthorizationURL() }";
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
