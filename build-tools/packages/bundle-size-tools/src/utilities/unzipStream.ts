/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unzipSync } from "fflate";

/**
 * Type alias for unzipped archive contents - a Map of file paths to their contents.
 */
export type UnzippedContents = Map<string, Buffer>;

function readStreamAsBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const data: any[] = [];
		stream.on("data", (chunk) => {
			data.push(chunk);
		});
		stream.on("close", () => {
			resolve(Buffer.concat(data));
		});
		stream.on("error", (error) => {
			reject(error);
		});
	});
}

/**
 * Unzips a stream and returns a Map of file paths to their contents.
 * @param stream - The stream containing zip data
 * @param baseFolder - Optional folder prefix to filter by and strip from paths
 * @returns A Map where keys are relative file paths and values are file contents as Buffers
 */
export async function unzipStream(
	stream: NodeJS.ReadableStream,
	baseFolder?: string,
): Promise<UnzippedContents> {
	const buffer = await readStreamAsBuffer(stream);
	const unzipped = unzipSync(new Uint8Array(buffer));

	const files = new Map<string, Buffer>();
	const prefix = baseFolder ? `${baseFolder}/` : "";

	for (const [path, data] of Object.entries(unzipped)) {
		if (prefix && !path.startsWith(prefix)) continue;
		// Strip the base folder prefix for cleaner relative paths
		const relativePath = prefix ? path.slice(prefix.length) : path;
		if (relativePath) {
			files.set(relativePath, Buffer.from(data));
		}
	}

	return files;
}
