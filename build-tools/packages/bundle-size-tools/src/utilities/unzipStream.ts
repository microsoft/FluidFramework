/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Unzipped, unzip } from "fflate";

/**
 * Lazy wrapper around unzipped archive that decompresses files on access.
 */
class LazyUnzippedContents extends Map<string, Buffer> {
	private readonly unzipped: Unzipped;
	private readonly prefix: string;
	private readonly fileKeys: Set<string>;

	constructor(unzipped: Unzipped, prefix: string) {
		super();
		this.unzipped = unzipped;
		this.prefix = prefix;
		this.fileKeys = new Set();

		// Populate available file keys
		for (const path of Object.keys(unzipped)) {
			if (prefix && !path.startsWith(prefix)) continue;
			const relativePath = prefix ? path.slice(prefix.length) : path;
			if (relativePath) {
				this.fileKeys.add(relativePath);
			}
		}
	}

	override get(key: string): Buffer | undefined {
		// Check if the file exists
		if (!this.fileKeys.has(key)) {
			return undefined;
		}

		// Check if already decompressed
		const cached = super.get(key);
		if (cached !== undefined) {
			return cached;
		}

		// Decompress on first access
		const fullPath = this.prefix ? `${this.prefix}${key}` : key;
		const buffer = Buffer.from(this.unzipped[fullPath]);
		super.set(key, buffer);
		return buffer;
	}

	override has(key: string): boolean {
		return this.fileKeys.has(key);
	}

	override keys(): IterableIterator<string> {
		return this.fileKeys.keys();
	}

	override *entries(): IterableIterator<[string, Buffer]> {
		for (const key of this.fileKeys) {
			yield [key, this.get(key)!];
		}
	}

	override *values(): IterableIterator<Buffer> {
		for (const key of this.fileKeys) {
			yield this.get(key)!;
		}
	}

	override get size(): number {
		return this.fileKeys.size;
	}
}

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
 * Files are decompressed lazily on first access to reduce memory usage.
 * @param stream - The stream containing zip data
 * @param baseFolder - Optional folder prefix to filter by and strip from paths
 * @returns A Map where keys are relative file paths and values are file contents as Buffers
 */
export async function unzipStream(
	stream: NodeJS.ReadableStream,
	baseFolder?: string,
): Promise<UnzippedContents> {
	const buffer = await readStreamAsBuffer(stream);

	return new Promise((resolve, reject) => {
		unzip(new Uint8Array(buffer), (err, unzipped) => {
			if (err) {
				reject(err);
				return;
			}

			const prefix = baseFolder ? `${baseFolder}/` : "";
			resolve(new LazyUnzippedContents(unzipped, prefix));
		});
	});
}
