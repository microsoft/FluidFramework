/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	params: { currentVersion, ltsVersion },
} = require("../../data/versions.json");

const routes = {
	"/docs/apis": `/docs/api/${currentVersion}`,
	"/docs/api/current": `/docs/api/${currentVersion}`,
	"/docs/api/lts": `/docs/api/${ltsVersion}`,
};

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from /docs/data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 *
 * @param {object} context - The context object provided by the server framework, used here to set the response.
 * @param {object} req.headers - The headers of the HTTP request object.
 */
module.exports = async (context, { headers }) => {
	const { pathname, search } = new URL(headers["x-ms-original-url"], `http://${headers.host}`);
	const route = findRoute(pathname, routes);

	context.res = {
		status: route === undefined ? 404 : 302,
		headers: {
			location:
				route === undefined
					? headers["x-ms-original-url"]
					: getRedirectUrl(pathname, search, route),
		},
	};
};

const findRoute = (pathname) =>
	Object.entries(routes).find(([path, _]) => new RegExp(path).test(pathname));

const getRedirectUrl = (pathname, search, route) => `${pathname.replace(...route)}${search}`;
