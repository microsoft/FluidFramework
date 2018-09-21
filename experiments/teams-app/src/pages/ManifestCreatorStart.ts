import * as express from "express";
import * as config from "config";

export class ManifestCreatorStart {

    public static getRequestHandler(): express.RequestHandler {
        return async function (req: any, res: any, next: any): Promise<void> {
            let baseUri = config.get("app.baseUri");
            // a valid base uri cannot simply be your locally running instance
            let validBaseUri = baseUri && !(/^https:\/\/localhost|^http:\/\/localhost|^localhost/i.test(baseUri));
            let appId = config.get("bot.botId");
            // this is to check against the default value I put in the env variable for the Glitch deployment
            let validAppId = appId && appId !== "NeedToSetThis";

            res.render("manifest-creator/manifestCreatorStart", {
                baseUri: baseUri,
                validBaseUri: validBaseUri,
                appId: appId,
                validAppId: validAppId,
                createManifestEnabled: validBaseUri && validAppId,
            });
        };
    }
}
