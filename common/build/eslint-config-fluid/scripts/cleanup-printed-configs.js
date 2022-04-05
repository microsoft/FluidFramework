/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const sortJson = require("sort-json");

(async () => {
    const myArgs = process.argv.slice(2);
    const sourcePath = myArgs[0] ? myArgs[0] : undefined;
    const files = await fs.promises.readdir(sourcePath);

    for (const file of files) {
        let json;
        let filePath = path.join(sourcePath, file);

        let content = fs.readFileSync(filePath);
        json = JSON.parse(content);

        // Remove the parser property because it's an absolute path and will vary based on the local environment.
        delete json.parser;

        // Write out the file
        fs.writeFileSync(filePath, JSON.stringify(json, undefined, 4));

        // Sort the JSON in-place
        sortJson.overwrite(filePath, { indentSize: 4 });
    }
})();
