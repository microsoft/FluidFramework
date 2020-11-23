/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
To update them, edit markdown.config.js and run npm run readme:update in the root of the repo -->

## Getting Started

You can run this example using the following steps:

1. Run \`npm install\` and \`npm run build:fast\` from the \`FluidFramework\` root directory.
   a. For an even faster build, you can add the package name to the build command, like this:
      \`npm run build:fast ${getPackageName(path)}\``;

    const defaultSteps = `
1. Navigate to this directory (${getPackagePath(path)}).
1. Run \`npm run start\`.`;

    const tinyliciousSteps = `
1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](../../../server/tinylicious).
1. Run \`npm run start\` from this directory and open <http://localhost:8080> on the browser to see the app running
`;

    if (includeTinylicious) {
        return preamble + tinyliciousSteps;
    } else {
        return preamble + defaultSteps;
    }
}

/* markdown-magic config */
module.exports = {
    transforms: {
        /* Match <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js) --> */
        INCLUDE(content, options) {
            const fileContents = fs.readFileSync(options.path, "utf8");
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
