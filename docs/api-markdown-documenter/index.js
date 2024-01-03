/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This index script runs the renderApiDocumentation script using the version configurations described
 * in data/versions.json. This script allows for an optional boolean parameter which determines whether
 * renderApiDocumentation will be ran for all versions or only previous versions. (pass in true for all versions)
 * e.g. "node ./api-markdown-documenter/index.js true"
 */

const chalk = require("chalk");
const path = require("path");
const versions = require("../data/versions.json");
const { buildRedirects } = require("./build-redirects");
const { renderApiDocumentation } = require("./render-api-documentation");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

const apiDocRenders = docVersions.map(async (version) => {
	// We don't add a version-postfix directory name for "current" version, since local website builds want to use the
	// locally generated API doc models when present.
	const versionPostfix = version === versions.params.currentVersion ? "" : `-${version}`;

	const apiReportsDirectoryPath = path.resolve(
		__dirname,
		"..",
		"..",
		`_api-extractor-temp${versionPostfix}`,
		"doc-models",
	);

	// TODO: remove check for 2.0 and just set apiDocsDirectoryPath to include version.
	// currently publishing to base apis directory until 2.0 release
	const apiDocsDirectoryPath = renderMultiVersion
		? path.resolve(__dirname, "..", "content", "docs", "api", version)
		: path.resolve(__dirname, "..", "content", "docs", "api");

	// TODO: remove check for 2.0 and just set uriDirectoryPath to include version.
	// currently publishing to base apis directory until 2.0 release
	const uriRootDirectoryPath = renderMultiVersion ? `/docs/api/${version}` : `/docs/api`;

	await renderApiDocumentation(
		apiReportsDirectoryPath,
		apiDocsDirectoryPath,
		uriRootDirectoryPath,
		version,
	);

	console.log(chalk.green(`(${version}) API docs written!`));
});

Promise.all(apiDocRenders).then(
	() => {
		console.log(chalk.green("All API docs written!"));

		buildRedirects().then(
			() => {
				console.log(chalk.green("Redirects generated!"));
			},
			() => {
				// Encountered 1 or more errors.
				// Exit with non-0 code to fail build.
				process.exit(1);
			},
		);
	},
	() => {
		// Encountered 1 or more errors.
		// Exit with non-0 code to fail build.
		process.exit(1);
	},
);
