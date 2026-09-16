/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates a `Getting Started` heading and contents for the specified example package.
 *
 * @param {string} packageJsonPath - The path to the package's `package.json` file.
 * @param {boolean} includeTinyliciousStep - Whether or not to include the `Tinylicious` step in the instructions.
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateExampleGettingStartedSection = (
	packageJsonPath,
	includeTinyliciousStep,
	headingOptions,
) => {
	const packageJsonMetadata = getPackageMetadata(packageJsonPath);
	const packageName = packageJsonMetadata.name;

	const sectionBody = [];
	sectionBody.push("Complete these steps to run the example:\n");
	sectionBody.push(
		"1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).",
	);
	sectionBody.push("1. From the `FluidFramework` root directory, run `pnpm install`.");
	sectionBody.push(`1. From the \`FluidFramework\` root directory, run \`pnpm run build:fast --nolint\`.
    - To build only this package, add the package name to the command:
      \`pnpm run build:fast --nolint ${packageName}\``);

	if (includeTinyliciousStep) {
		sectionBody.push(
			`1. In a separate terminal, run \`pnpm tinylicious\` from this directory to start Tinylicious.`,
		);

		sectionBody.push(
			`1. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to \`public\`. Do not use \`Private to Organization\`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).`,
		);
	}

	sectionBody.push(`1. Run \`pnpm start\` from this directory.`);
	sectionBody.push(`1. Open <http://localhost:8080> in a web browser.`);

	sectionBody.push(
		`\nTo run the example with SharePoint, complete these steps:\n
1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
1. Run \`pnpm start:spo\` or \`pnpm start:spo-df\` from this directory.
1. Open <http://localhost:8080> in a web browser.`,
	);

	return formattedSectionText(sectionBody.join("\n"), {
		...headingOptions,
		headingText: "Getting Started",
	});
};

/**
 * Generates a "Getting Started" section for an example app README.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.usesTinylicious - (optional) Whether or not the example app workflow uses {@link https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious | Tinylicious}.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
 * default: `TRUE`.
 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
 * Must be a positive integer.
 * Default: {@link defaultSectionHeadingLevel}.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function exampleGettingStartedTransform(content, options, config) {
	const usesTinylicious = options.usesTinylicious !== "FALSE";
	const headingOptions = parseHeadingOptions(options);

	const packageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	return formattedGeneratedContentBody(
		generateExampleGettingStartedSection(packageJsonPath, usesTinylicious, headingOptions),
	);
}

module.exports = {
	generateExampleGettingStartedSection,
	exampleGettingStartedTransform,
};
