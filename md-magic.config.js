/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const pathLib = require("path");

const getPackageName = (path) => {
    try {
        const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
        return pkg.name;
    } catch (ex) {
        console.log(ex);
    }
}

const getPackagePath = (path) => {
    const inPosix = pathLib.dirname(path).split(pathLib.sep).join(pathLib.posix.sep);
    return inPosix;
}

const getStartedInfo = (path, includeTinylicious = false) => {
    const preamble = `<!-- The getting started instructions are automatically generated.
To update them, edit md-magic.config.js in the root of the repo, then run npm run readme:update -->

## Getting Started

You can run this example using the following steps:

1. Run \`npm install\` and \`npm run build:fast -- --nolint\` from the \`FluidFramework\` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      \`npm run build:fast -- --nolint ${getPackageName(path)}\``;

    const tinyliciousStep = `1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).`;
    const finalStep = `1. Run \`npm run start\` from this directory (${getPackagePath(path)}) and open <http://localhost:8080> in a web browser to see the app running.`;

    const steps = [
        preamble,
        includeTinylicious ? tinyliciousStep : undefined,
        finalStep,
    ].filter(item => item !== undefined);

    return steps.join("\n");
}

/* markdown-magic config */
module.exports = {
    transforms: {
        /* Match <!-- AUTO-GENERATED-CONTENT:START (INCLUDE_ROOT:path=../file.js) --> */
        INCLUDE_ROOT(content, options) {
            console.log(`reading ${options.path}`);
            let fileContents = fs.readFileSync(options.path, "utf8");
            if (options.start || options.end) {
                options.start = options.start || 0;
                options.end = options.end || undefined;
                const split = fileContents.split(/\r?\n/);
                fileContents = split.slice(options.start, options.end).join("\n");
            }
            return fileContents;
        },
        /* Match <!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) --> */
        GET_STARTED(content, options, config) {
            // console.log(JSON.stringify(config, null, 2));
            const dir = pathLib.dirname(config.originalPath);
            const jsonPath = pathLib.join(dir, "package.json");
            if(options && options.tinylicious) {
                return getStartedInfo(jsonPath, options.tinylicious);
            }else {
                return getStartedInfo(jsonPath, false);
            }
        },
        // SCRIPTS: require("markdown-magic-package-scripts"),
    },
    callback: function () {
        console.log("done");
    }
}
