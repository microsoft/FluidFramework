/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { IsoBuffer, Uint8ArrayToString, assert } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
	ISnapshotTree,
	ISummaryBlob,
	ISummaryTree,
	IVersion,
	SummaryObject,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import { compress, decompress } from "lz4js";
import { DocumentStorageServiceProxy } from "../../documentStorageServiceProxy";

export enum SummaryCompressionAlgorithm {
	None = 1,
	LZ4 = 2,
}
export interface ICompressionStorageConfig {
	algorithm: SummaryCompressionAlgorithm;
	minSizeToCompress: number;
}

/**
 * This class extends the DocumentStorageServiceProxy so that it can apply various kinds of compressions
 * to the blob payload.
 */
export class DocumentStorageServiceCompressionAdapter extends DocumentStorageServiceProxy {
	private readonly _compressedBlobIds: Map<string, number> = new Map();
	private static readonly compressed_prefix: string = "compressed_";
	private static readonly defaultIsUseB64OnCompressed = true;

	constructor(
		service: IDocumentStorageService,
		private readonly _config: ICompressionStorageConfig,
		private readonly _isUseB64OnCompressed = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
	) {
		super(service);
	}

	private hasCompression(name: string): boolean {
		const trimmed = name.trim();
		return trimmed.startsWith(DocumentStorageServiceCompressionAdapter.compressed_prefix);
	}

	/**
	 * This method converts the algorithm string from the blob name
	 * into the number. It also asserts that the algorithm string represents the number.
	 * @param name - The name of the blob
	 */
	private extractAlgorithm(name: string): number {
		const algorithmStr = this.extractAlgorithmString(name);
		assert(algorithmStr !== undefined, "Algorithm string is undefined");
		assert(!isNaN(parseInt(algorithmStr, 10)), "Algorithm string is not a number");
		return parseInt(algorithmStr, 10);
	}

	/** This method extracts the algorithm number identifier from the name of the blob.
	 * It asserts that the blob has compression. If it has a compression, it
	 * uses regexp to obtain the algorithm string. Algorithm string is
	 * located as follows "compressed_\<algorithm string\>_\<blob name\>"
	 * @param name - The name of the blob
	 */
	private extractAlgorithmString(name: string): string | undefined {
		assert(this.hasCompression(name), "Blob has no compression");
		const trimmed = name.trim();
		const regex = new RegExp(
			`^${DocumentStorageServiceCompressionAdapter.compressed_prefix}(.+?)_`,
		);
		const match = regex.exec(trimmed);
		return match !== null ? match[1] : undefined;
	}

	/**
	 * This method removes the compression and algorithm prefix from the blob path. If there is no compression prefix, it will
	 * return the same path
	 * @param name - The path of the blob
	 */
	private decodeName(name: string): string {
		if (!this.hasCompression(name)) {
			return name;
		}
		let decoded = name
			.trim()
			.substring(DocumentStorageServiceCompressionAdapter.compressed_prefix.length);

		const algorithmStr = this.extractAlgorithmString(name);
		if (algorithmStr !== undefined) {
			decoded = decoded.substring(algorithmStr.length+1);
		}
		return decoded;
	}

	private async decodeSnapshotBlobNames(snapshot: ISnapshotTree): Promise<void> {
		for (const key of Object.keys(snapshot.trees)) {
			const obj = snapshot.trees[key];
			await this.decodeSnapshotBlobNames(obj);
		}
		for (const key of Object.keys(snapshot.blobs)) {
			if (!this.hasCompression(key)) {
				continue;
			}
			const algorithm = this.extractAlgorithm(key);
			const origKey = this.decodeName(key);
			const blobId = snapshot.blobs[key];
			if (blobId !== undefined) {
				this._compressedBlobIds.set(blobId, algorithm);
				snapshot.blobs[origKey] = blobId;
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete snapshot.blobs[key];
			}
		}
	}

	public override async readBlob(id: string): Promise<ArrayBufferLike> {
		const algorithm = this._compressedBlobIds.get(id);
		if (algorithm === undefined) {
			return super.readBlob(id);
		}
		return DocumentStorageServiceCompressionAdapter.decodeBlob(
			await super.readBlob(id),
			algorithm,
		);
	}

	public override async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		const snapshotTree = await super.getSnapshotTree(version, scenarioName);
		if (snapshotTree !== null) {
			await this.decodeSnapshotBlobNames(snapshotTree);
		}
		return snapshotTree;
	}

	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const prep = DocumentStorageServiceCompressionAdapter.compressSummary(
			summary,
			this._config,
			this._isUseB64OnCompressed,
			context,
		);
		return super.uploadSummaryWithContext(prep.prepSummary, prep.prepContext);
	}

	public static compressSummary(
		summary: ISummaryTree,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
		context: ISummaryContext,
	) {
		const prep = {
			prepSummary: DocumentStorageServiceCompressionAdapter.recursivelyReplace(
				summary,
				DocumentStorageServiceCompressionAdapter.blobReplacer,
				config,
				isUseB64OnCompressed,
				context,
			) as ISummaryTree,
			prepContext: context,
		};
		console.log(`Miso Summary Upload: ${JSON.stringify(prep.prepSummary).length}`);
		return prep;
	}

	private static readonly blobReplacer = (
		input: SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
		context?: ISummaryContext,
	): SummaryObject => {
		if (input.type === SummaryType.Blob) {
			const summaryBlob: ISummaryBlob = input;
			const decompressed: Uint8Array =
				typeof summaryBlob.content === "string"
					? new TextEncoder().encode(summaryBlob.content)
					: summaryBlob.content;
			if (
				config.minSizeToCompress !== undefined &&
				decompressed.length < config.minSizeToCompress
			) {
				return input;
			}
			const compressed: ArrayBufferLike = DocumentStorageServiceCompressionAdapter.encodeBlob(
				decompressed,
				config.algorithm,
			);
			let newSummaryBlob;
			if (isUseB64OnCompressed) {
				// TODO: This step is now needed, it looks like the function summaryTreeUploadManager#writeSummarPyBlob
				// fails on assertion at 2 different generations of the hash which do not lead to
				// the same result if the ISummaryBlob.content is in the form of ArrayBufferLike
				const compressedString = Uint8ArrayToString(IsoBuffer.from(compressed), "base64");
				const compressedEncoded = new TextEncoder().encode(compressedString);
				newSummaryBlob = {
					type: SummaryType.Blob,
					content: compressedEncoded,
				};
			} else {
				newSummaryBlob = {
					type: SummaryType.Blob,
					content: IsoBuffer.from(compressed),
				};
			}
			return newSummaryBlob;
		} else {
			return input;
		}
	};

	private static encodeBlob(file: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		let compressed: ArrayBufferLike;
		if (algorithm === undefined || algorithm === SummaryCompressionAlgorithm.None) {
			return file;
		} else {
			if (algorithm === SummaryCompressionAlgorithm.LZ4) {
				compressed = compress(file) as ArrayBufferLike;
			} else {
				throw new Error(`Unknown Algorithm ${algorithm}`);
			}
		}
		return compressed;
	}

	private static decodeBlob(file: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		let decompressed: ArrayBufferLike;
		let compressedEncoded = file;
		if (algorithm === SummaryCompressionAlgorithm.LZ4) {
			try {
				decompressed = decompress(compressedEncoded) as ArrayBufferLike;
			} catch (e) {
				const compressedString = new TextDecoder().decode(file);
				compressedEncoded = IsoBuffer.from(compressedString, "base64");
				decompressed = decompress(compressedEncoded) as ArrayBufferLike;
			}
		} else {
			throw new Error(`Unknown Algorithm ${algorithm}`);
		}
		return decompressed;
	}

	private static buildPrefix(algorithm: number): string {
		return algorithm === SummaryCompressionAlgorithm.LZ4
			? `${this.compressed_prefix + algorithm.toString()}_`
			: "";
	}

	private static recursivelyReplace(
		input: SummaryObject,
		replacer: (
			input: SummaryObject,
			config: ICompressionStorageConfig,
			isUseB64OnCompressed: boolean,
			context?: ISummaryContext,
		) => SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean,
		context?: ISummaryContext,
	): SummaryObject {
		assert(typeof input === "object", "input must be a non-null object");
		const maybeReplaced = replacer(input, config, isUseB64OnCompressed, context);
		if (maybeReplaced !== input) {
			return maybeReplaced;
		}
		let clone: object | undefined;
		for (const key of Object.keys(input)) {
			const value = input[key];

			if (Boolean(value) && typeof value === "object") {
				const replaced = this.recursivelyReplace(
					value as SummaryObject,
					replacer,
					config,
					isUseB64OnCompressed,
					context,
				);
				if (replaced !== value) {
					clone = clone ?? (Array.isArray(input) ? [...input] : { ...input });
					let newKey = key;
					if (replaced.type === SummaryType.Blob) {
						// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
						delete clone[key];
						newKey = this.buildPrefix(config.algorithm) + key;
					}
					clone[newKey] = replaced;
				}
			}
		}
		return (clone ?? input) as SummaryObject;
	}
}
