/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "node:fs";
import path from "node:path";
import { Handler, readFile, writeFile } from "./common.js";

const serverPath = "server/routerlicious/";

function getDockerfileCopyText(packageFilePath: string): string {
	const packageDir = packageFilePath.split("/").slice(0, -1).join("/");
	return `COPY ${packageDir}/package*.json ${packageDir}/`;
}

const localMap = new Map<string, Buffer>();
function getOrAddLocalMap(key: string, getter: () => Buffer): Buffer {
	if (!localMap.has(key)) {
		localMap.set(key, getter());
	}
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	return localMap.get(key)!;
}

export const handler: Handler = {
	name: "dockerfile-packages",
	match: /^(server\/routerlicious\/packages)\/.*\/package\.json/i,
	handler: async (file: string, gitRoot: string): Promise<string | undefined> => {
		// strip server path since all paths are relative to server directory
		const dockerfileCopyText = getDockerfileCopyText(
			path.relative(gitRoot, file).replace(serverPath, ""),
		);
		const dockerFilePath = path.join(
			path.relative(process.cwd(), path.join(gitRoot, serverPath)),
			"Dockerfile",
		);
		const dockerfileContents = getOrAddLocalMap("dockerfileContents", () =>
			fs.readFileSync(dockerFilePath),
		);

		if (!dockerfileContents.includes(dockerfileCopyText)) {
			return "Routerlicious Dockerfile missing COPY command for this package";
		}
	},
	resolver: (file: string, gitRoot: string): { resolved: boolean } => {
		// strip server path since all paths are relative to server directory
		const dockerfileCopyText = getDockerfileCopyText(
			path.relative(gitRoot, file).replace(serverPath, ""),
		);
		const dockerFilePath = path.join(
			path.relative(process.cwd(), path.join(gitRoot, serverPath)),
			"Dockerfile",
		);
		// add to Dockerfile
		let dockerfileContents = readFile(dockerFilePath);

		if (!dockerfileContents.includes(dockerfileCopyText)) {
			// regex basically find the last of 3 or more consecutive COPY package lines
			const endOfCopyLinesRegex =
				/(copy\s+packages\/.*\/package\*\.json\s+packages\/.*\/\s*\n){3,}[^\S\r]*(?<newline>\r?\n)+/gi;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const regexMatch = endOfCopyLinesRegex.exec(dockerfileContents)!;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const localNewline = regexMatch.groups!.newline;
			const insertIndex = regexMatch.index + regexMatch[0].length - localNewline.length;

			dockerfileContents =
				dockerfileContents.slice(0, Math.max(0, insertIndex)) +
				dockerfileCopyText +
				localNewline +
				// eslint-disable-next-line unicorn/prefer-string-slice
				dockerfileContents.substring(insertIndex, dockerfileContents.length);

			writeFile(dockerFilePath, dockerfileContents);
		}

		return { resolved: true };
	},
};
