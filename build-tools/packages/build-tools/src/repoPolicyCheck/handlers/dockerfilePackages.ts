/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import fs from "fs";

import { Handler, readFile, writeFile } from "../common";

const serverPath = "server/routerlicious/";
const serverDockerfilePath = `${serverPath}Dockerfile`;

function getDockerfileCopyText(packageFilePath: string) {
    const packageDir = packageFilePath.split("/").slice(0, -1).join("/");
    return `COPY ${packageDir}/package*.json ${packageDir}/`;
}

const localMap = new Map();
function getOrAddLocalMap(key: string, getter: () => Buffer) {
    if (!localMap.has(key)) {
        localMap.set(key, getter());
    }
    return localMap.get(key);
}

export const handler: Handler = {
    name: "dockerfile-packages",
    match: /^(server\/routerlicious\/packages)\/.*\/package\.json/i,
    handler: (file) => {
        // strip server path since all paths are relative to server directory
        const dockerfileCopyText = getDockerfileCopyText(file.replace(serverPath, ""));

        const dockerfileContents = getOrAddLocalMap("dockerfileContents", () =>
            fs.readFileSync(serverDockerfilePath),
        );

        if (dockerfileContents.indexOf(dockerfileCopyText) === -1) {
            return "Routerlicious Dockerfile missing COPY command for this package";
        }
    },
    resolver: (file) => {
        const dockerfileCopyText = getDockerfileCopyText(file);

        // add to Dockerfile
        let dockerfileContents = readFile(serverDockerfilePath);

        if (dockerfileContents.indexOf(dockerfileCopyText) === -1) {
            // regex basically find the last of 3 or more consecutive COPY package lines
            const endOfCopyLinesRegex =
                /(COPY\s+server\/routerlicious\/packages\/.*\/package\*\.json\s+server\/routerlicious\/packages\/.*\/\s*\n){3,}[^\S\r]*(?<newline>\r?\n)+/gi;
            const regexMatch = endOfCopyLinesRegex.exec(dockerfileContents)!;
            const localNewline = regexMatch.groups!.newline;
            const insertIndex = regexMatch.index + regexMatch[0].length - localNewline.length;

            dockerfileContents =
                dockerfileContents.substring(0, insertIndex) +
                dockerfileCopyText +
                localNewline +
                dockerfileContents.substring(insertIndex, dockerfileContents.length);

            writeFile(serverDockerfilePath, dockerfileContents);
        }

        return { resolved: true };
    },
};
