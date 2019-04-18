// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License:
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED ""AS IS"", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import * as express from "express";
import * as jwt from "jsonwebtoken";
import * as config from "config";
import { OpenIdMetadata } from "../utils/OpenIdMetadata";

// Validate the AAD token in the Authorization header and return the decoded token
export class ValidateAADToken {

    public static listen(): express.RequestHandler {
        let msaOpenIdMetadata = new OpenIdMetadata("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration");
        return (req: express.Request, res: express.Response) => {
            // Get bearer token
            let authHeaderMatch = /^Bearer (.*)/i.exec(req.header("authorization"));
            if (!authHeaderMatch) {
                console.error("No Authorization token provided");
                res.sendStatus(401);
                return;
            }

            // Decode token and get signing key
            const encodedToken = authHeaderMatch[1];
            const decodedToken = jwt.decode(encodedToken, { complete: true });
            msaOpenIdMetadata.getKey(decodedToken["header"].kid, (key) => {
                if (!key) {
                    console.error("Invalid signing key or OpenId metadata document");
                    res.sendStatus(500);
                }

                // Verify token
                const verifyOptions: jwt.VerifyOptions = {
                    algorithms: ["RS256", "RS384", "RS512"],
                    issuer: `https://sts.windows.net/${decodedToken["payload"].tid}/`,
                    audience: config.get("app.appId"),
                    clockTolerance: 300,
                };
                try {
                    let token = jwt.verify(encodedToken, key.key, verifyOptions);
                    res.status(200).send(token);
                } catch (e) {
                    console.error("Invalid bearer token", e);
                    res.sendStatus(401);
                }
            });
        };
    }

}
