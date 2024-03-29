/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { type IOdspTokens, getServer } from "@fluidframework/odsp-doclib-utils/internal";
import {
	OdspTokenConfig,
	OdspTokenManager,
	getMicrosoftConfiguration,
	odspTokensCache,
} from "@fluidframework/tool-utils";
import express, { type Response } from "express";
import webpack from "webpack";
import webpackDevMiddleware from "webpack-dev-middleware";
import webpackHotMiddleware from "webpack-hot-middleware";

import config from "../webpack.config.cjs";

import { _dirname } from "./dirname.cjs";

const getThisOrigin = (port: number): string => `http://localhost:${port}`;
let odspAuthStage = 0;
let odspAccessToken: string | undefined;

const app = express();
const compiler = webpack(config);

app.use(
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	webpackDevMiddleware(compiler, {
		publicPath: config.output.publicPath,
	}),
);

app.use(webpackHotMiddleware(compiler));

app.get("/", (req, res) => res.redirect("/fetchApp"));

app.get("/fetchApp", (req, res) => {
	(async (): Promise<void> => {
		const originalUrl = `${getThisOrigin(8080)}${req.url}`;
		let first = true;
		if (odspAuthStage === 0) {
			first = await getOdspToken(res, originalUrl);
		}
		if (first) {
			assert(odspAccessToken !== undefined, "token should be intialized now");
			return prepareResponse(req, res, odspAccessToken);
		}
	})().catch((error) => console.log("Error in rendering", error));
});

app.use(express.static(_dirname));

app.listen(8080, () => {
	console.log("Node server is running..");
});

async function getOdspToken(res: Response, originalUrl: string): Promise<boolean> {
	const buildTokenConfig = (
		response: Response,
		redirectUriCallback?: (tokens: IOdspTokens) => Promise<string>,
	): OdspTokenConfig => ({
		type: "browserLogin",
		navigator: (url: string) => response.redirect(url),
		redirectUriCallback,
	});
	const tokenManager = new OdspTokenManager(odspTokensCache);
	await tokenManager.getOdspTokens(
		getServer("spo-df"),
		getMicrosoftConfiguration(),
		buildTokenConfig(res, async (tokens: IOdspTokens) => {
			odspAccessToken = tokens.accessToken;
			odspAuthStage += 1;
			return originalUrl;
		}),
		true /* forceRefresh */,
		true,
	);
	return false;
}

const prepareResponse = (req: express.Request, res: express.Response, token: string): void => {
	const documentId = req.params.id;
	const html = `<!DOCTYPE html>
        <html style="height: 100%;" lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${documentId}</title>
        </head>
        <body style="margin: 0; height: 100%;">
            <div id="content" style="min-height: 100%;">
            </div>
            <script type="text/javascript" src="/fluid-loader.bundle.js">
            </script>
            <script>
                FluidLoader.start(
                    document.getElementById("content"),
                    "${token}",
                )
            </script>
        </body>
        </html>`;

	res.setHeader("Content-Type", "text/html");
	res.end(html);
};
