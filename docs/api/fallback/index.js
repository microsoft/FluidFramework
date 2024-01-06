const {
	params: { currentVersion, ltsVersion },
} = require("../../data/versions.json");

const routes = {
	"/docs/apis/.*": `/docs/api/${currentVersion}/.*`,
	"/docs/api/current/.*": `/docs/api/${currentVersion}/.*`,
	"/docs/api/lts/.*": `/docs/api/${ltsVersion}/.*`,
};

const findRoute = (url, routes) =>
	Object.entries(routes).find(([path, _]) => new RegExp(path).test(url.pathname));

const getRedirectUrl = (parsedURL, route) => {
	if (!route) {
		return undefined;
	}

	const [basePath, targetPath] = route.map((path) => path.replace(/\.\*$/, ""));
	return `${parsedURL.pathname.replace(basePath, targetPath)}${parsedURL.search}`;
};

/**
 * Handles incoming HTTP requests and redirects them to the appropriate URL based on the current and LTS versions.
 * It reads the versions from data/versions.json and matches the incoming URL to a set of predefined routes.
 * If a matching route is found, it constructs and returns the redirect URL. Otherwise, it returns a 404 response.
 *
 * @param {object} context - The context object provided by the server framework, used here to set the response.
 * @param {object} req - The HTTP request object. Expected to contain headers with 'x-ms-original-url' and 'host' for constructing the full original URL.
 * @returns {Promise<void>} A promise that resolves when the function has completed processing the request. The actual response is set in the `context.res` object.
 */

module.exports = async (context, req) => {
	const parsedURL = new URL(req.headers["x-ms-original-url"], `http://${req.headers.host}`);
	const route = findRoute(parsedURL, routes);
	const redirectUrl = getRedirectUrl(parsedURL, route);

	context.res = {
		status: redirectUrl === undefined ? 404 : 302,
		headers: { location: redirectUrl },
	};
};
