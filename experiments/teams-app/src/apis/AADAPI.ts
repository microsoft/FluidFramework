import { AADRequestAPI } from "./AADRequestAPI";
import * as querystring from "querystring";
import * as config from "config";
import * as jwt from "jsonwebtoken";

// tslint:disable-next-line:variable-name
export interface ValidatedAADInformation {
    objectId: string;
}

export class AADAPI {

    private requestAPI: AADRequestAPI;

    constructor () {
        this.requestAPI = new AADRequestAPI();
    }

    public async getLoginURL(validationNumber: string): Promise<string> {
        let aadRequestAPI = new AADRequestAPI();
        let aadAuthorizationInfo = await aadRequestAPI.getAsync("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration", {}, {});
        aadAuthorizationInfo = JSON.parse(aadAuthorizationInfo);
        // console.log(JSON.stringify(aadAuthorizationInfo));

        let clientId = config.get("bot.botId");
        // let clientSecret = config.get("bot.botPassword");
        // let authorityHostUrl = "https://login.windows.net";
        // let tenant = "####";
        // let authorityUrl = authorityHostUrl + "/" + tenant;
        let redirectUri = config.get("app.baseUri") + "/api/success";
        // let templateAuthzUrl = "https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/authorize?response_type=code&client_id=" + clientId + "&redirect_uri=" + redirectUri + "&state=<state>&scope=openid%20profile";
        let queryParams = {
            response_type: "code",
            client_id: clientId,
            redirect_uri: redirectUri,
            state: validationNumber,
            scope: "openid profile",
        };
        // "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?"
        let authorizationUrl = aadAuthorizationInfo.authorization_endpoint + "?" + querystring.stringify(queryParams);

        // let createAuthorizationUrl = (state) => {
        //     return templateAuthzUrl.replace("<state>", state);
        // };

        // let authorizationUrl = createAuthorizationUrl(validationNumber);
        return authorizationUrl;
    }

    /**
     * This method returns an object with a validated AAD object_id, token, and refresh token.
     */
    public async getValidatedAADInformation(code: string): Promise<ValidatedAADInformation> {
        let aadRequestAPI = new AADRequestAPI();
        let aadAuthorizationInfo = await aadRequestAPI.getAsync("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration", {}, {});
        aadAuthorizationInfo = JSON.parse(aadAuthorizationInfo);
        // console.log(JSON.stringify(aadAuthorizationInfo));
        let keysObject = await aadRequestAPI.getAsync(aadAuthorizationInfo.jwks_uri, {}, {});
        let keys = JSON.parse(keysObject).keys;

        let headers = {
            "Content-Type": "application/x-www-form-urlencoded",
        };

        let clientId = config.get("bot.botId");
        let clientSecret = config.get("bot.botPassword");
        // let authorityHostUrl = "https://login.windows.net";
        // let tenant = "####";
        // let authorityUrl = authorityHostUrl + "/" + tenant;
        let redirectUri = config.get("app.baseUri") + "/api/success";

        let body = {
            grant_type: "authorization_code",
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            code: code,
            scope: "openid profile",
        };
        // let postResultData = await new AADRequestAPI().postAsync("https://login.microsoftonline.com/" + tenant + "/oauth2/v2.0/token", args);
        // let aadRequestAPI = new AADRequestAPI();
        // let postResultData = await aadRequestAPI.postAsync("https://login.microsoftonline.com/common/oauth2/v2.0/token", headers, body);
        let tokens = await aadRequestAPI.postAsync(aadAuthorizationInfo.token_endpoint, headers, body);
        tokens = JSON.parse(tokens);
        // tokens = JSON.parse(tokens);
        let validatedInfo = this.validateAADInformation(keys, aadAuthorizationInfo.issuer, tokens.id_token);
        if (validatedInfo) {
            return validatedInfo;
        } else {
            return null;
        }
    }

    private validateAADInformation(keys: any, issuerTemplateUrl: string, idToken: string): any {
        let claims = jwt.decode(idToken, { complete: true });
        if (!claims) {
            return false;
        }

        let type = claims["header"].typ;
        let algorithm = claims["header"].alg;
        let signingKeyId = claims["header"].kid;
        let tenantId = claims["payload"].tid;

        if (type !== "JWT") {
            return false;
        }

        let issuer = issuerTemplateUrl.replace("{tenantid}", tenantId);

        let signingKey = keys.find((element) =>
            {
                return element.kid === signingKeyId;
            },
        );

        if (!signingKey) {
            return false;
        }

        let signingCerts = signingKey.x5c;
        signingCerts = signingCerts.map(this.convertCertificateToBeOpenSSLCompatible);

        for (let i = 0; i < signingCerts.length; i++) {
            try {
                let currSigningCert = signingCerts[i];
            //   # jwt.verify verifies that the signature matches, the audience
            //   #  is this app, the issuer is who we expected it to be, and that
            //   #  the token is signed using the correct algorithm.
                let decodedToken = jwt.verify(
                    idToken,
                    currSigningCert,
                    {
                        audience: config.get("bot.botId"),
                        algorithms: [ algorithm ],
                        issuer: issuer,
                    },
                );

            //   # return the user object.
            //   return resolve(
            //     id: decodedToken.oid,
            //     displayName: decodedToken.name,
            //     mail: decodedToken.preferred_username,
            //     tokens: tokens
            //   )
                return decodedToken;
            } catch (e) {
                // do nothing
                // return false;
            }
        }

        return false;
    }

    private convertCertificateToBeOpenSSLCompatible(cert: string): string {
        // let cert = "####";
        // let finalCert = (cert) => {
        let beginCert = "-----BEGIN CERTIFICATE-----";
        let endCert = "-----END CERTIFICATE-----";
        cert = cert.replace("\n", "");
        cert = cert.replace(beginCert, "");
        cert = cert.replace(endCert, "");
        let result = beginCert;
        while (cert.length > 0) {
            if (cert.length > 64) {
                result += "\n" + cert.substring(0, 64);
                cert = cert.substring(64, cert.length);
            } else {
                result += "\n" + cert;
                cert = "";
            }
        }
        if (result[result.length ] !== "\n") {
            result += "\n";
        }
        result += endCert + "\n";

        return result;
    }
}
