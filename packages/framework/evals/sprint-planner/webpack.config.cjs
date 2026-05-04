/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");
const https = require("https");
const path = require("path");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;

	return {
		entry: {
			app: "./src/App.tsx",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.css$/,
					use: ["style-loader", "css-loader"],
				},
				{
					test: /\.m?js$/,
					use: ["source-map-loader"],
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			devtoolNamespace: "fluid-example/sprint-planner",
			libraryTarget: "umd",
		},
		plugins: [
			new HtmlWebpackPlugin({
				template: "./src/index.html",
			}),
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
		devServer: {
			setupMiddlewares: (middlewares, devServer) => {
				const { DefaultAzureCredential, getBearerTokenProvider } = require("@azure/identity");
				const credential = new DefaultAzureCredential();
				const tokenProvider = getBearerTokenProvider(
					credential,
					"https://cognitiveservices.azure.com/.default",
				);

				// Proxy /azure-openai/* to Azure OpenAI with Entra ID auth injected server-side.
				// This lets the browser skip Azure AD app registration — it shares the CLI's az login session.
				devServer.app.use("/azure-openai", async (req, res) => {
					try {
						const token = await tokenProvider();
						const targetUrl = new URL(
							req.url,
							"https://eval-framework-resource.openai.azure.com",
						);

						const headers = {
							...req.headers,
							host: targetUrl.host,
							authorization: `Bearer ${token}`,
						};
						delete headers["api-key"];

						const proxyReq = https.request(
							targetUrl,
							{ method: req.method, headers },
							(proxyRes) => {
								res.writeHead(proxyRes.statusCode, proxyRes.headers);
								proxyRes.pipe(res);
							},
						);

						proxyReq.on("error", (err) => {
							console.error("Azure OpenAI proxy error:", err);
							if (!res.headersSent) {
								res.status(502).json({ error: `Proxy error: ${err.message}` });
							}
						});

						req.pipe(proxyReq);
					} catch (err) {
						console.error("Azure auth error:", err);
						if (!res.headersSent) {
							res.status(401).json({ error: "Azure auth failed. Run: az login" });
						}
					}
				});

				return middlewares;
			},
		},
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
