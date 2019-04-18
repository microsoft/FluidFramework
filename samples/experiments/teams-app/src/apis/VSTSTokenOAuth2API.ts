import * as request from "request";
import * as querystring from "querystring";
import * as config from "config";
let http = require("http");
import * as express from "express";
import * as builder from "botbuilder";
// import { loadSessionAsync } from "../utils/DialogUtils";
// import { Strings } from "../locale/locale";
// import { DialogIds } from "../utils/DialogIds";
import { MongoDbTempTokensStorage } from "../storage/MongoDbTempTokensStorage";

// Callback for HTTP requests
export interface RequestCallback {
    (error: any, body?: any): void;
}

// API wrapper
export class VSTSTokenOAuth2API {

    public static getUserAuthorizationURL(): string {
        let args = {
            client_id: config.get("vstsApp.appId"),
            response_type: "Assertion",
            state: "",
            scope: "vso.work",
            redirect_uri: config.get("app.baseUri") + "/api/VSTSOauthCallback",
        };

        let url = "https://app.vssps.visualstudio.com/oauth2/authorize/?" + querystring.stringify(args);
        return url;
    }

    public static setUserAccessToken (bot: builder.UniversalBot): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            try {

                let code = req.query.code;

                let auth = new VSTSTokenOAuth2API();

                // change to be more "random" and robust than this
                let randomValidationNumber = Math.floor((Math.random() * 1000000) + 1);

                await auth.tempSaveTokens(code, randomValidationNumber.toString());

                // res.send(session.gettext(Strings.please_return_to_teams, randomValidationNumber));
                res.redirect(config.get("app.baseUri") + "/api/validateUser?validationNumb=" + randomValidationNumber);
            } catch (e) {
                // Don't log expected errors
                res.send(`<html>
                    <body>
                    <p>
                        Sorry.  There has been an error.` +
                        e.toString() +
                    `</p>
                    <br>
                    <img src="/tab/error_generic.png" alt="default image" />
                    </body>
                    </html>`,
                );
            }
        };
    }

    constructor() {
        // do nothing
    }

    public async tempSaveTokens(code: string, randomValidationNumber: string): Promise<void> {
        let args = {
            assertion: code,
            tokenRequestType: "get_token",
         };

        let resp = await this.postAsync("", args);

        let body = JSON.parse(resp);

        // session.userData.vstsAuth = {
        //     token: body.access_token,
        //     refreshToken: body.refresh_token,
        //     isValidated: false,
        //     randomValidationNumber: randomValidationNumber,
        // };

        let tempTokensEntry = {
            _id: randomValidationNumber,
            token: body.access_token,
            refreshToken: body.refresh_token,
        };

        // let tempTokensStorage = new MongoDbTempTokensStorage("temp-tokens-test", config.get("mongoDb.connectionString"));
        let tempTokensDbConnection = await MongoDbTempTokensStorage.createConnection();
        // make this call something we can await?
        await tempTokensDbConnection.saveTempTokensAsync(tempTokensEntry);
        await tempTokensDbConnection.close();
    }

    public async refreshTokens(session: builder.Session): Promise<void> {
        session.sendTyping();
        let args = {
            vsts_refresh_token: session.userData.vstsAuth.refreshToken,
            tokenRequestType: "refresh_token",
         };

        let resp = await this.postAsync("", args);

        let body = JSON.parse(resp);

        session.userData.vstsAuth.token = body.access_token;
        session.userData.vstsAuth.refreshToken = body.refresh_token;

        // used for debugging to let developer know tokens were refreshed
        // session.send(Strings.tokens_refreshed_confirmation);

        // try to save the tokens in case no other messages are sent
        session.save().sendBatch();
    }

    // Make a POST request to API.
    // Syntax: .post(uri, [query], callback)
    public post(uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        this.request("POST", uri, argsOrCallback, callback);
    };

    public postAsync(uri: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.post(uri, args, (err, result) => {
                if (!err) {
                    resolve(result);
                } else {
                    reject(err);
                }
            });
        });
    };

    // Make a request to API.
    // Syntax: .request(method, uri, [query], callback)
    private request(method: string, uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        let args: any;

        if (callback) {
            args = argsOrCallback;
        } else {
            callback = argsOrCallback;
            args = {};
        }

        let options: request.Options = {
            url: "https://app.vssps.visualstudio.com/oauth2/token",
            method: method,
            headers: {
                "content-type": "application/x-www-form-urlencoded",
            },
        };

        if (args.tokenRequestType === "get_token") {
            options.body = "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" +
                "&client_assertion=" + config.get("vstsApp.appSecret") +
                "&grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer" +
                "&assertion=" + args.assertion +
                "&redirect_uri=" + config.get("app.baseUri") + "/api/VSTSOauthCallback";

        } else if (args.tokenRequestType === "refresh_token") {
            options.body = "client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer" +
                "&client_assertion=" + config.get("vstsApp.appSecret") +
                "&grant_type=refresh_token" +
                "&assertion=" + args.vsts_refresh_token +
                "&redirect_uri=" + config.get("app.baseUri") + "/api/VSTSOauthCallback";
        }

        let requestCallback = function (err: any, response: any, body: any): void {
            if (!err && response.statusCode >= 400) {
                err = new Error(body);
                err.statusCode = response.statusCode;
                err.responseBody = body;
                err.statusMessage = http.STATUS_CODES[response.statusCode];
            }

            callback(err, body);
        };

        request.post(options, requestCallback);
    };
}
