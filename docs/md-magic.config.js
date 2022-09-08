/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const pathLib = require("path");
const template = require("markdown-magic-template");
const fetch = require("node-fetch");
const os = require("os");

const mdMagicTemplatesPath = pathLib.join(__dirname, "..", ".md-magic-templates");

const generatedContentNotice = `<!-- This section is automatically generated.
To update it, edit docs/md-magic.config.js  then run 'npm run build:md-magic' in the docs folder. -->`

const getPackageJsonPath = (originalPath) => {
    const dir = pathLib.dirname(originalPath);
    return pathLib.join(dir, "package.json");
}

const getPackageJson = (originalPath) => {
    const packageJsonPath = getPackageJsonPath(originalPath);
    const packageJson = getPackageMetadata(packageJsonPath);
    packageJson.shortName = getShortName(packageJson.name);
    return packageJson;
}

const getRepoRoot = () => {
    const root = pathLib.normalize(pathLib.join(__dirname, ".."));
    return root;
}

const getPackageMetadata = (path) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
        return pkg;
    } catch (ex) {
        console.log(ex);
    }
}

const getPackageName = (path) => {
    return getPackageMetadata(path).name;
}

const getShortName = (longName) => {
    const arr = longName.split("/", 2);
    if (arr[1]) {
        return arr[1];
    }
    return arr[0];
}

const getPackagePath = (path) => {
    path = pathLib.dirname(pathLib.relative(getRepoRoot(), path));
    return toPosix(path);
}

const toPosix = (path) => {
    const inPosix = path.split(pathLib.sep).join(pathLib.posix.sep);
    return inPosix;
}

const getStartedInfo = (path, includeTinylicious = false) => {
    const preamble = `${generatedContentNotice}

## Getting Started

You can run this example using the following steps:

1. Run \`npm install\` and \`npm run build:fast -- --nolint\` from the \`FluidFramework\` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      \`npm run build:fast -- --nolint ${getPackageName(path)}\``;

    const tinyliciousStep = `1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).`;
    const finalStep = `1. Run \`npm run start\` from this directory (${getPackagePath(path)}) and open <http://localhost:8080> in a web browser to see the app running.`;

    const steps = [
        preamble,
        includeTinylicious ? tinyliciousStep : undefined,
        finalStep,
    ].filter(item => item !== undefined);

    return `${steps.join("\n")}\n`;
}

const generateInstallationSection = (pkg, devDependency) => {
    return `## Installation

To get started, install the package by running the following command:

\`\`\`bash
npm i ${pkg.name}${devDependency ? " -D" : ""}
\`\`\``;
}

const trademarkSection = `## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.`;

const generateApiDocsLinkSection = (pkg) => {
    return `## API Documentation

API documentation for **${pkg.name}** is available at <https://fluidframework.com/docs/apis/${pkg.shortName}>.`;
}

const generateScriptsSection = (scriptsTable) => {
    return `## Scripts

${scriptsTable}`;
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
            const jsonPath = getPackageJsonPath(config.originalPath);
            if (options && options.tinylicious) {
                return getStartedInfo(jsonPath, options.tinylicious);
            } else {
                return getStartedInfo(jsonPath, false);
            }
        },
        PKGJSON(content, options, config) {
            options.pkg = getPackageJsonPath(config.originalPath);
            return require("markdown-magic-package-json")(content, options, config);
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (README_SIMPLE:installation=true apiDocs=true scripts=true trademark=true devDependency=false) --> */
        README_SIMPLE(content, options, config) {
            const pkg = getPackageJson(config.originalPath);

            const sections = [generatedContentNotice];

            if(options.installation !== "FALSE") {
                sections.push(generateInstallationSection(pkg, options.devDependency));
            }

            if(options.apiDocs !== "FALSE") {
                sections.push(generateApiDocsLinkSection(pkg));
            }

            if(options.scripts !== "FALSE") {
                const scriptsTable = require("markdown-magic-package-scripts")(content, options, config);
                sections.push(generateScriptsSection(scriptsTable));
            }

            if(options.trademark !== "FALSE") {
                sections.push(trademarkSection);
            }

            return sections.join(`${os.EOL}${os.EOL}`);
        },
        TEMPLATE(content, options, config) {
            const pkg = getPackageJson(config.originalPath);

            options = options || {};
            options.src = pathLib.relative(dir, pathLib.join(mdMagicTemplatesPath, options.src));
            return template({ pkg: pkg })(content, options, config);
        },
        SCRIPTS: require("markdown-magic-package-scripts"),
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
