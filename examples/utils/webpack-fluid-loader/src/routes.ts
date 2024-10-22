/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";

import { getOdspCredentials } from "@fluid-private/test-drivers";
import { IFluidPackage } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { IPublicClientConfig } from "@fluidframework/odsp-doclib-utils/internal";
import {
	OdspTokenConfig,
	OdspTokenManager,
	odspTokensCache,
} from "@fluidframework/tool-utils/internal";
import Axios from "axios";
import express from "express";
import nconf from "nconf";
import type Server from "webpack-dev-server";
import type { Configuration, ExpressRequestHandler, Middleware } from "webpack-dev-server";

import { tinyliciousUrls } from "./getUrlResolver.js";
import { RouteOptions } from "./loader.js";

const tokenManager = new OdspTokenManager(odspTokensCache);

const getThisOrigin = (options: RouteOptions): string => `http://localhost:${options.port}`;

function getPublicClientConfig(): IPublicClientConfig {
	const clientId = process.env.local__testing__clientId;
	if (!clientId) {
		// See the "SharePoint" section of webpack-fluid-loader's README for prerequisites to running examples against odsp.
		throw new Error(
			"Client ID environment variable not set: local__testing__clientId. Did you run the getkeys tool?",
		);
	}
	return {
		clientId,
	};
}

function getTestTenantCredentials(mode: "spo" | "spo-df"): {
	tokenConfig: OdspTokenConfig;
	siteUrl: string;
	server: string;
} {
	const credentials = getOdspCredentials(mode === "spo" ? "odsp" : "odsp-df", 0);
	// If we wanted to allow some mechanism for user selection, we could add it here.
	const { username, password } = credentials[0];

	const emailServer = username.substr(username.indexOf("@") + 1);

	let siteUrl: string;
	if (emailServer.startsWith("http://") || emailServer.startsWith("https://")) {
		siteUrl = emailServer;
	} else {
		const tenantName = emailServer.substr(0, emailServer.indexOf("."));
		siteUrl = `https://${tenantName}.sharepoint.com`;
	}

	const { host } = new URL(siteUrl);

	return {
		tokenConfig: {
			type: "password",
			username,
			password,
		},
		siteUrl,
		server: host,
	};
}

const beforeMiddlewares: Middleware[] = [
	{
		path: "/",
		middleware: ((req, res, next) => {
			// For some reason, this middleware is matching for other paths that it shouldn't.
			// E.g. matching for "/new", causing infinite redirect.
			if (req.originalUrl === "/") {
				res.redirect("/new");
			} else {
				next();
			}
		}) as ExpressRequestHandler,
	},
];

const makeAfterMiddlewares = (
	webpackServer: Server,
	baseDir: string,
	env: Partial<RouteOptions>,
): Middleware[] => {
	const options: RouteOptions = {
		mode: "local",
		...env,
		...{ port: webpackServer.options.port ?? 8080 },
	};
	const config: nconf.Provider = nconf
		.env({ parseValues: true, separator: "__" })
		.file(path.join(baseDir, "config.json"));

	// Check that tinylicious is running when it is selected
	switch (options.mode) {
		case "docker": {
			// Include Docker Check
			break;
		}
		case "tinylicious": {
			const hostUrl = tinyliciousUrls(options).hostUrl;
			Axios.get(hostUrl)
				.then()
				.catch((err) => {
					throw new Error(`${err.message}

                ERROR: Cannot connect to Tinylicious service at URL: ${hostUrl}

                Please ensure the Fluid Framework Tinylicious service is running.
                (See https://www.npmjs.com/package/tinylicious for details.)
                `);
				});
			break;
		}
		default: {
			break;
		}
	}

	if (options.mode === "docker" || options.mode === "r11s" || options.mode === "tinylicious") {
		options.bearerSecret = options.bearerSecret ?? config.get("fluid:webpack:bearerSecret");
		if (options.mode !== "tinylicious") {
			options.tenantId = options.tenantId ?? config.get("fluid:webpack:tenantId") ?? "fluid";

			options.enableWholeSummaryUpload =
				options.enableWholeSummaryUpload ??
				config.get("fluid:webpack:enableWholeSummaryUpload") ??
				false;
			if (typeof options.enableWholeSummaryUpload === "string") {
				options.enableWholeSummaryUpload = options.enableWholeSummaryUpload === "true";
			}

			options.tenantSecret =
				options.mode === "docker"
					? (options.tenantSecret ??
						config.get("fluid:webpack:docker:tenantSecret") ??
						"create-new-tenants-if-going-to-production")
					: (options.tenantSecret ?? config.get("fluid:webpack:tenantSecret"));

			if (options.mode === "r11s") {
				options.discoveryEndpoint =
					options.discoveryEndpoint ?? config.get("fluid:webpack:discoveryEndpoint");
				options.fluidHost = options.fluidHost ?? config.get("fluid:webpack:fluidHost");
			}
		}
	}

	options.npm = options.npm ?? config.get("fluid:webpack:npm");

	console.log(options);

	if (options.mode === "r11s" && !(options.tenantId && options.tenantSecret)) {
		throw new Error(
			"You must provide a tenantId and tenantSecret to connect to a live routerlicious server",
		);
	}

	let readyP: ((req: express.Request, res: express.Response) => Promise<boolean>) | undefined;
	if (options.mode === "spo-df" || options.mode === "spo") {
		const { tokenConfig, server } = getTestTenantCredentials(options.mode);
		options.server = server;
		const clientConfig = getPublicClientConfig();

		readyP = async (req: express.Request, res: express.Response) => {
			if (req.baseUrl === "/favicon.ico") {
				// ignore these
				return false;
			}

			const [odspTokens, pushTokens] = await Promise.all([
				tokenManager.getOdspTokens(
					server,
					clientConfig,
					tokenConfig,
					undefined /* forceRefresh */,
					options.forceReauth,
				),
				tokenManager.getPushTokens(
					server,
					clientConfig,
					tokenConfig,
					undefined /* forceRefresh */,
					options.forceReauth,
				),
			]);
			options.odspAccessToken = odspTokens.accessToken;
			options.pushAccessToken = pushTokens.accessToken;
			return true;
		};
	}

	const isReady = async (req, res) => {
		if (readyP !== undefined) {
			let canContinue = false;
			try {
				canContinue = await readyP(req, res);
			} catch (error) {
				let toLog = error;
				try {
					toLog = JSON.stringify(error);
				} catch {}
				console.log(toLog);
			}
			if (!canContinue) {
				if (!res.finished) {
					res.end();
				}
				return false;
			}
		}

		return true;
	};

	const afterMiddlewares: Middleware[] = [
		{
			path: "/odspLogin",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			middleware: async (req, res) => {
				if (options.mode !== "spo-df" && options.mode !== "spo") {
					res.write("Mode must be spo or spo-df to login to ODSP.");
					res.end();
					return;
				}

				const { tokenConfig, server } = getTestTenantCredentials(options.mode);
				const tokens = await tokenManager.getOdspTokens(
					server,
					getPublicClientConfig(),
					tokenConfig,
					undefined /* forceRefresh */,
					true /* forceReauth */,
				);
				options.odspAccessToken = tokens.accessToken;
				res.redirect(`${getThisOrigin(options)}/pushLogin`);
			},
		},
		{
			path: "/pushLogin",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			middleware: async (req, res) => {
				if (options.mode !== "spo-df" && options.mode !== "spo") {
					res.write("Mode must be spo or spo-df to login to Push.");
					res.end();
					return;
				}

				const { tokenConfig, server } = getTestTenantCredentials(options.mode);
				options.pushAccessToken = (
					await tokenManager.getPushTokens(
						server,
						getPublicClientConfig(),
						tokenConfig,
						undefined /* forceRefresh */,
						true /* forceReauth */,
					)
				).accessToken;
				res.end("Tokens refreshed.");
			},
		},
		{
			path: "/file*",
			middleware: (req, res) => {
				const buffer = fs.readFileSync(req.params[0].substr(1));
				res.end(buffer);
			},
		},
		{
			/**
			 * For urls of format - http://localhost:8080/doc/<id>.
			 * This is when user is trying to load an existing document. We try to load a Container with `id` as documentId.
			 */
			path: "/doc/:id*",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			middleware: async (req, res) => {
				const ready = await isReady(req, res);
				if (ready) {
					fluid(req, res, baseDir, options);
				}
			},
		},
		{
			// Ignore favicon.ico urls.
			path: "/favicon.ico",
			middleware: ((req: express.Request, res) => res.end()) as ExpressRequestHandler,
		},
		{
			/**
			 * For urls of format - http://localhost:8080/<id>.
			 * If the `id` is "new" or "manualAttach", the user is trying to create a new document.
			 * For other `ids`, we treat this as the user trying to load an existing document. We redirect to
			 * http://localhost:8080/doc/<id>.
			 */
			path: "/:id*",
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			middleware: async (req: express.Request, res) => {
				const documentId = req.params.id;
				// For testing orderer, we use the path: http://localhost:8080/testorderer. This will use the local storage
				// instead of using actual storage service to which the connection is made. This will enable testing
				// orderer even if the blob storage services are down.
				if (
					documentId !== "new" &&
					documentId !== "manualAttach" &&
					documentId !== "testorderer"
				) {
					// The `id` is not for a new document. We assume the user is trying to load an existing document and
					// redirect them to - http://localhost:8080/doc/<id>.
					const reqUrl = req.baseUrl.replace(documentId, `doc/${documentId}`);
					const newUrl = `${getThisOrigin(options)}${reqUrl}`;
					res.redirect(newUrl);
					return;
				}

				const ready = await isReady(req, res);
				if (ready) {
					fluid(req, res, baseDir, options);
				}
			},
		},
	];

	return afterMiddlewares;
};

/**
 * @returns A portion of a webpack config needed to add support for the
 * webpack-dev-server to use the webpack-fluid-loader.
 * @internal
 */
export function devServerConfig(
	baseDir: string,
	env: RouteOptions,
): { devServer: Configuration } {
	return {
		devServer: {
			static: {
				directory: path.join(
					baseDir,
					"/node_modules/@fluid-example/webpack-fluid-loader/dist/",
				),
				publicPath: "/code",
			},
			devMiddleware: {
				publicPath: "/dist",
			},
			setupMiddlewares: (middlewares, devServer) => {
				for (const beforeMiddleware of beforeMiddlewares) {
					middlewares.unshift(beforeMiddleware);
				}

				const afterMiddlewares = makeAfterMiddlewares(devServer, baseDir, env);

				for (const afterMiddleware of afterMiddlewares) {
					middlewares.push(afterMiddleware);
				}

				return middlewares;
			},
		},
	};
}

const fluid = (
	req: express.Request,
	res: express.Response,
	baseDir: string,
	options: RouteOptions,
) => {
	const documentId = req.params.id;
	// eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
	const packageJson = require(path.join(baseDir, "./package.json")) as IFluidPackage;

	const umd = packageJson.fluid.browser?.umd;
	assert(umd !== undefined, 0x329 /* browser.umd property is undefined */);

	const html = `<!DOCTYPE html>
<html style="height: 100%;" lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body style="margin: 0; height: 100%;">
    <div id="content" style="min-height: 100%;"></div>

    <script src="/code/fluid-loader.bundle.js"></script>
    ${umd.files.map((file) => `<script src="/${file}"></script>\n`)}
    <script>
        var options = ${JSON.stringify(options)};
        var fluidStarted = false;
        FluidLoader.start(
            "${documentId}",
            window["${umd.library}"],
            options,
            document.getElementById("content"))
        .then(() => fluidStarted = true)
    </script>
</body>
</html>`;

	res.setHeader("Content-Type", "text/html");
	res.end(html);
};
