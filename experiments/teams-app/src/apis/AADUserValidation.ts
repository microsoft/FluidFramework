import * as express from "express";
// let fs = require("fs");
// let path = require("path");
import * as builder from "botbuilder";
import * as config from "config";
// import { AADRequestAPI } from "./AADRequestAPI";
import { MongoDbTempTokensStorage } from "../storage/MongoDbTempTokensStorage";
import { MongoDbAADObjectIdStorage } from "../storage/MongoDbAADObjectIdStorage";
import { AADAPI } from "./AADAPI";
import { isEmptyObj } from "../utils/DialogUtils";

export class AADUserValidation {
    public static validateUser(bot: builder.UniversalBot): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            try {
                let aadAPI = new AADAPI();
                let authorizationUrl = await aadAPI.getLoginURL(req.query.validationNumb);
                res.redirect(authorizationUrl);
            } catch (e) {
                // Don't log expected errors - error is probably from there not being example dialogs
                res.send(`<html>
                    <body>
                    <p>
                        Sorry - There has been an error.` +
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

    public static success(bot: builder.UniversalBot): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            try {
                    // return result
                // }

                // .post('grant_type=authorization_code&client_id=' + clientId + '&client_secret=' + clientSecret + '&redirect_uri=' + redirectUri + '&code=' + req.query.code + '&scope=User.Read%20Group.ReadWrite.All%20User.ReadWrite.All%20offline_access')((err, resp, body) =>
                // .post()((err, resp, body) =>
                //     @robot.logger.debug "#{LogPrefix} client err='#{err}'"
                //     @robot.logger.debug "#{LogPrefix} client resp='#{resp}'"
                //     @robot.logger.debug "#{LogPrefix} client body='#{body}'"
                //     data = JSON.parse(body)
                //     @robot.logger.debug "#{LogPrefix} client data='#{data}'"
                //     res.send(data)
                // );

                // let tempTokensStorage = new MongoDbTempTokensStorage("temp-tokens-test", config.get("mongoDb.connectionString"));
                let tempTokensDbConnection = await MongoDbTempTokensStorage.createConnection();
                // make this call something we can await?
                let tempTokensEntry = await tempTokensDbConnection.getTempTokensAsync(req.query.state);

                await tempTokensDbConnection.deleteTempTokensAsync(req.query.state);

                await tempTokensDbConnection.close();

                let aadAPI = new AADAPI();
                let validatedAADInfo = await aadAPI.getValidatedAADInformation(req.query.code);

                let htmlPage = `
                    <html>
                    <head>
                    </head>
                    <body>
                        <h1>You did it!!!</h1>
                        <p>`;

                htmlPage += "Params: " +
                    JSON.stringify(req.params) +
                    "<br><br>Body: " +
                    JSON.stringify(req.body) +
                    "<br><br>Query: " +
                    JSON.stringify(req.query);

                htmlPage += "<br><br>validatedAADInfo: " +
                    JSON.stringify(validatedAADInfo);

                htmlPage += "<br><br>Cleaned Cert: " +
                    // result;
                    null;

                htmlPage += "<br><br>Entry in DB:<br>" +
                    JSON.stringify(tempTokensEntry);

                htmlPage += "<br><br>Token:<br>" +
                    tempTokensEntry.token;

                htmlPage += "<br><br>RefreshToken:<br>" +
                    tempTokensEntry.refreshToken;

                htmlPage += "<br><br>AAD Object Id:<br>" +
                    (validatedAADInfo as any).oid;

                // https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
                // https://login.microsoftonline.com/####/v2.0/.well-known/openid-configuration

                htmlPage += `
                        </p>
                        <a href="${ config.get("app.baseUri") + "/vstsAuthFlowEnd" }">Success</a>
                    </body>
                    </html>`;

                let aadObjectId = (validatedAADInfo as any).oid;
                let vstsToken = tempTokensEntry.token;
                let vstsRefreshToken = tempTokensEntry.refreshToken;

                let botStateDb = await MongoDbAADObjectIdStorage.createConnection();
                let userData = await botStateDb.getEntryByAADObjectId(aadObjectId);

                if (isEmptyObj(userData)) {
                    botStateDb.saveTokensByAADObjectId(
                        {
                            aadObjectId: aadObjectId,
                            vstsToken: vstsToken,
                            vstsRefreshToken: vstsRefreshToken,
                        },
                    );
                } else {
                    let vstsAuth = {
                        token: vstsToken,
                        refreshToken: vstsRefreshToken,
                    };
                    userData.vstsAuth = vstsAuth;
                    botStateDb.saveBotEntry(userData);
                }

                botStateDb.close();

                res.send(htmlPage);
            } catch (e) {
                // Don't log expected errors - error is probably from there not being example dialogs
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
}
