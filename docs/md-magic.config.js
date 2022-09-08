/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const pathLib = require("path");
const template = require("markdown-magic-template");
const fetch = require("node-fetch");
const scripts = require("markdown-magic-package-scripts");
const os = require("os");

const mdMagicTemplatesPath = pathLib.join(__dirname, "..", ".md-magic-templates");

const generatedContentNotice = `<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->`

/**
 * Gets the path to the repo root.
 */
const getRepoRoot = () => {
    const root = pathLib.normalize(pathLib.join(__dirname, ".."));
    return root;
}

/**
 * Gets the path to the package's `package.json` file, given the path to the document including this.
 *
 * @param {string} originalPath - Path to the file for which `md-magic` is being invoked.
 */
const getPackageJsonPathFromOriginalPath = (originalPath) => {
    const dir = pathLib.dirname(originalPath);
    return pathLib.join(dir, "package.json");
}

/**
 * Gets the package's `package.json` contents, given the path to the document including this.
 *
 * @param {string} originalPath - Path to the file for which `md-magic` is being invoked.
 */
const getPackageJsonFromOriginalPath = (originalPath) => {
    const packageJsonPath = getPackageJsonPathFromOriginalPath(originalPath);
    const packageJson = getPackageMetadata(packageJsonPath);
    return packageJson;
}

/**
 * Gets the package's `package.json` contents, given the path to its package.json file.
 *
 * @param {string} packageJsonFilePath - Path to a `package.json` file.
 */
const getPackageMetadata = (packageJsonFilePath) => {
    try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonFilePath, "utf8"));
        packageJson.shortName = getShortPackageName(packageJson.name);
        return packageJson;
    } catch (ex) {
        console.log(ex);
    }
}

/**
 * Gets a package short-name (unscoped-name) from a scoped package name.
 *
 * @param {string} scopedPackageName - A scoped package name.
 */
const getShortPackageName = (scopedPackageName) => {
    const arr = scopedPackageName.split("/", 2);
    if (arr[1]) {
        return arr[1];
    }
    return arr[0];
}

/**
 * Gets the path (relative to the `docs` directory) to the package directory given the path to its `package.json` file.
 *
 * @param {string} packageJsonPath - Path to the package's `package.json` file.
 */
const getPackagePath = (packageJsonPath) => {
    packageJsonPath = pathLib.dirname(pathLib.relative(getRepoRoot(), packageJsonPath));
    return toPosix(packageJsonPath);
}

/**
 * Converts the provided path to POSIX form.
 *
 * @param {string} path - The path to convert.
 */
const toPosix = (path) => {
    const inPosix = path.split(pathLib.sep).join(pathLib.posix.sep);
    return inPosix;
}

/**
 * Generates a `Getting Started` heading and contents for the specified package.
 *
 * @param {string} packageJsonPath - Path to the package's `package.json` file.
 * @param {boolean} includeTinylicious - Whether or not to include the `Tinylicious` step in the instructions.
 */
const getStartedInfo = (packageJsonPath, includeTinylicious = false) => {
    const packageJson = getPackageMetadata(packageJsonPath);

    const preamble = `${generatedContentNotice}

## Getting Started

You can run this example using the following steps:

1. Run \`npm install\` and \`npm run build:fast -- --nolint\` from the \`FluidFramework\` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      \`npm run build:fast -- --nolint ${packageJson.name}\``;

    const tinyliciousStep = `1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).`;
    const finalStep = `1. Run \`npm run start\` from this directory (${getPackagePath(packageJsonPath)}) and open <http://localhost:8080> in a web browser to see the app running.`;

    const steps = [
        preamble,
        includeTinylicious ? tinyliciousStep : undefined,
        finalStep,
    ].filter(item => item !== undefined);

    return `${steps.join("\n")}\n`;
}

/**
 * Generats a simple Markdown heading and contents with package installation instructions.
 *
 * @param {object} packageJson - `package.json` contents
 * @param {boolean} devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateInstallationSection = (packageJson, devDependency, includeHeading) => {
    const sectionBody = `To get started, install the package by running the following command:

\`\`\`bash
npm i ${packageJson.name}${devDependency ? " -D" : ""}
\`\`\``;

    return includeHeading
        ? `## Installation${os.EOL}${os.EOL}${sectionBody}`
        : sectionBody;
}

/**
 * Generats a simple Markdown heading and contents with trademark information.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateTrademarkSection = (includeHeading) => {
    const sectionBody = `This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.`;

    return includeHeading
        ? `## Trademark${os.EOL}${os.EOL}${sectionBody}`
        : sectionBody;
}

/**
 * Generats a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {object} packageJson - `package.json` contents
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateApiDocsLinkSection = (packageJson, includeHeading) => {
    const sectionBody = `API documentation for **${packageJson.name}** is available at <https://fluidframework.com/docs/apis/${packageJson.shortName}>.`;

    return includeHeading
        ? `## API Documentation${os.EOL}${os.EOL}${sectionBody}`
        : sectionBody;
}

/**
 * Generats a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateScriptsSection = (scriptsTable, includeHeading) => {
    return includeHeading
        ? `## Scripts${os.EOL}${os.EOL}${scriptsTable}`
        : scriptsTable;
}

const fetchFunc = async (content, options) => {
    const response = await fetch(options.url);
    let remoteContent = await response.text();

    // console.log(remoteContent);
    // console.log(JSON.stringify(options));

    if (!remoteContent) {
        return content;
    }
    if (options.start || options.end) {
        options.start = options.start || 0;
        options.end = options.end || undefined;
        const split = remoteContent.split(/\r?\n/);
        remoteContent = split.slice(options.start, options.end).join("\n");
    }
    return remoteContent;
};

const includeContent = (options, config) => {
    try {
        let fileContents = fs.readFileSync(options.path, "utf8");
        if (options.start || options.end) {
            options.start = options.start || 0;
            options.end = options.end || undefined;
            const split = fileContents.split(/\r?\n/);
            fileContents = split.slice(options.start, options.end).join("\n");
        }
        return fileContents;
    } catch (ex) {
        console.error(`Exception processing "${config.originalPath}": ${ex}`);
        throw ex;
    }
}

/* markdown-magic config */
const mdMagicConfig = {
    transforms: {
        /* Match <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js) --> */
        // includes relative to the repo root
        INCLUDE(content, options, config) {
            options.path = pathLib.resolve(pathLib.join(getRepoRoot(), options.path));
            // console.log(options.path);
            // options.path = pathLib.normalize(pathLib.join(getRepoRoot(), "docs", options.path));
            // const relPath = pathLib.relative(getRepoRoot(), path);
            return includeContent(options, config);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (INCLUDE_ROOT:path=../file.js) --> */
        // includes relative to the file calling the include
        INCLUDE_RELATIVE(content, options) {
            options.path = pathLib.normalize(pathLib.join(pathLib.dirname(config.originalPath), options.path));
            return includeContent(options, config);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) --> */
        GET_STARTED(content, options, config) {
            const jsonPath = getPackageJsonPathFromOriginalPath(config.originalPath);
            if (options && options.tinylicious) {
                return getStartedInfo(jsonPath, options.tinylicious);
            } else {
                return getStartedInfo(jsonPath, false);
            }
        },
        PKGJSON(content, options, config) {
            options.pkg = getPackageJsonPathFromOriginalPath(config.originalPath);
            return require("markdown-magic-package-json")(content, options, config);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (README_SIMPLE:installation=TRUE&apiDocs=TRUE&scripts=TRUE&trademark=TRUE&devDependency=FALSE) --> */
        README_SIMPLE(content, options, config) {
            const pkg = getPackageJsonFromOriginalPath(config.originalPath);

            const sections = [generatedContentNotice];

            if(options.installation !== "FALSE") {
                sections.push(generateInstallationSection(pkg, options.devDependency, true));
            }

            if(options.apiDocs !== "FALSE") {
                sections.push(generateApiDocsLinkSection(pkg, true));
            }

            if(options.scripts !== "FALSE") {
                const scriptsTable = scripts(content, options, config);
                sections.push(generateScriptsSection(scriptsTable, true));
            }

            if(options.trademark !== "FALSE") {
                sections.push(generateTrademarkSection(true));
            }

            return sections.join(`${os.EOL}${os.EOL}`);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:includeHeading=TRUE) --> */
        README_API_DOCS_SECTION(content, options, config) {
            const includeHeading = options.includeHeading !== "FALSE";
            const pkg = getPackageJsonFromOriginalPath(config.originalPath);
            return generateApiDocsLinkSection(pkg, includeHeading);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:includeHeading=TRUE&devDependency=FALSE) --> */
        README_INSTALLATION_SECTION(content, options, config) {
            const includeHeading = options.includeHeading !== "FALSE";
            const pkg = getPackageJsonFromOriginalPath(config.originalPath);
            return generateInstallationSection(pkg, options.devDependency, includeHeading);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) --> */
        README_TRADEMARK_SECTION(content, options, config) {
            const includeHeading = options.includeHeading !== "FALSE";
            return generateTrademarkSection(includeHeading);
        },
        TEMPLATE(content, options, config) {
            const pkg = getPackageJsonFromOriginalPath(config.originalPath);

            options = options || {};
            options.src = pathLib.relative(dir, pathLib.join(mdMagicTemplatesPath, options.src));
            return template({ pkg: pkg })(content, options, config);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (SCRIPTS:includeHeading=TRUE) --> */
        SCRIPTS(content, options, config) {
            const includeHeading = options.includeHeading !== "FALSE";
            const scriptsTable = scripts(content, options, config);
            return generateScriptsSection(scriptsTable, includeHeading);
        },
        FETCH: fetchFunc,
    },
    callback: function () {
        console.log("done");
    },
    globbyOptions: {
        gitignore: true,
        onlyFiles: true,
        deep: 5
    }
}

module.exports = mdMagicConfig;
