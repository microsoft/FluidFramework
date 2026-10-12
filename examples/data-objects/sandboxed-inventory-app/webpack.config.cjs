/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");
const { exampleAppConfig } = require("@fluid-example/webpack-fluid-loader");

module.exports = (env) => {
	const config = exampleAppConfig(__dirname, env, { html: false });
	return {
		...config,
		entry: {
			host: "./src/index.tsx",
			guest: "./src/guest.tsx",
		},
		plugins: [
			...config.plugins,
			new HtmlWebpackPlugin({
				title: "Sandboxed inventory",
				template: "./src/page.ejs",
				filename: "index.html",
				chunks: ["host"],
			}),
			new HtmlWebpackPlugin({
				title: "Guest inventory",
				template: "./src/page.ejs",
				filename: "guest.html",
				chunks: ["guest"],
				scriptLoading: "module",
			}),
		],
		devServer: {
			...config.devServer,
			// Reloading a Guest outside application-managed teardown can leave its Host session alive.
			hot: false,
			liveReload: false,
			client: false,
			// The opaque-origin Guest needs CORS for its module script, not access to other server routes.
			headers: (request) =>
				request.url === "/guest.bundle.js" ? { "Access-Control-Allow-Origin": "*" } : {},
		},
	};
};
