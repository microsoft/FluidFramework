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
 * to the blob payload of the summary. The compression is applied only on uploading the summary, at the
 * creating of single blob (as an attachment), it is not applied.
 * The commpression of the blob is marked by adding the prefix "compressed_\<algorithm ID\>_" to the blob name.
 * The blob name is the key of the blob in the summary tree. That is the reason why we cannot use this technique
 * in the createBlob method as there is no such key which would identify the blob.
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

	/**
	 * This method returns true if the blob is compressed.
	 * @param name - The name of the blob
	 * @returns - True if the blob is compressed.
	 */
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
			decoded = decoded.substring(algorithmStr.length + 1);
		}
		return decoded;
	}

	/**
	 * This method traverses the snapshot tree obtained from the storage.
	 * If it finds a blob with compression, it will
	 * decode the blob name and replace it in the snapshot tree. The input
	 * parameter underlying data (blob names) are modified by this method.
	 * @param snapshot - The snapshot tree
	 */
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

	/**
	 * This method compresses the given SummaryObject in case it is SummaryBlob type.
	 * The compression is done only if the size of the blob is greater than the minSizeToCompress.
	 *
	 * @param input - The SummaryObject to be compressed
	 * @param config - The configuration of the compression
	 * @param isUseB64OnCompressed - If true, the compressed blob will be encoded to base64 string
	 * @returns - The compressed SummaryObject
	 */
	private static readonly blobReplacer = (
		input: SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
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

	/**
	 * This method compresses the given blob file using the given algorithm.
	 * @param file - The blob file to be compressed
	 * @param algorithm - The algorithm to be used for compression
	 * @returns - The compressed blob
	 */
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

	/**
	 * This method decompresses the given blob file using the given algorithm. It supports both
	 * compressed blob in ArrayBufferLike and base64 string format.
	 * @param file - The blob file to be decompressed
	 * @param algorithm - The algorithm to be used for decompression
	 * @returns - The decompressed blob
	 */
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

	/**
	 * This method builds the preffiex for the compressed blob name.
	 * @param algorithm - The algorithm to be used for compression
	 * @returns - The prefix for the compressed blob name
	 */
	private static buildPrefix(algorithm: number): string {
		return algorithm === SummaryCompressionAlgorithm.LZ4
			? `${this.compressed_prefix + algorithm.toString()}_`
			: "";
	}

	/**
	 * This method traverses the given SummaryObject and replaces the SummaryBlob type with the compressed blob.
	 * The blob is replaced only if the size of the blob is greater than the minSizeToCompress, which
	 * is supplied via config.
	 *
	 * @param input - The SummaryObject to be traversed
	 * @param replacer - The function to be used for replacing the SummaryBlob type
	 * @param config - The configuration of the compression
	 * @param isUseB64OnCompressed - If true, the compressed blob will be encoded to base64 string
	 * @param context - The context of the summary
	 * @returns - The SummaryObject with the replaced SummaryBlob type blobs.
	 */
	private static recursivelyReplace(
		input: SummaryObject,
		replacer: (
			input: SummaryObject,
			config: ICompressionStorageConfig,
			isUseB64OnCompressed: boolean,
		) => SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean,
		context?: ISummaryContext,
	): SummaryObject {
		assert(typeof input === "object", "input must be a non-null object");
		const maybeReplaced = replacer(input, config, isUseB64OnCompressed);
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

	/**
	 * This method compresses the given summary using the given algorithm supplied via
	 * config parameter. It supports both compressed blob in ArrayBufferLike and base64 string format.
	 * @param summary - The summary to be compressed
	 * @param config - The configuration of the compression
	 * @param isUseB64OnCompressed - If true, the compressed blob will be encoded to base64 string
	 * @returns - The compressed summary
	 */
	public static compressSummary(
		summary: ISummaryTree,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
	): ISummaryTree {
		const prep = DocumentStorageServiceCompressionAdapter.recursivelyReplace(
			summary,
			DocumentStorageServiceCompressionAdapter.blobReplacer,
			config,
			isUseB64OnCompressed,
		) as ISummaryTree;
		console.log(`Miso Summary Upload: ${JSON.stringify(prep).length}`);
		return prep;
	}

	/**
	 * This method decompresses the blob received by calling the original readBlob method using
	 * the given algorithm supplied via
	 * config parameter. It supports both compressed blob in ArrayBufferLike and base64 string format.
	 * If the blob is not compressed, it returns the blob as is.
	 * @param id - The id of the blob to be read
	 * @returns - The decompressed blob
	 */
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

	/**
	 * This method obtains the original snapshot tree from the base class
	 * and decodes the compressed blob names. It stores the compressed blobs IDs and the
	 * compression algorithm in a map for later use.
	 * @param version - the version of the snapshot tree
	 * @param scenarioName - the scenario name of the snapshot tree
	 * @returns - The snapshot tree with the compressed blob names decoded
	 */
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

	/**
	 * This method compressses the summary blobs (if applicable based on the config) and then
	 * calls the original uploadSummaryWithContext method. The summary with compressed blobs and the
	 * adjusted blob names are uploaded to the storage.
	 * @param summary - The summary to be uploaded
	 * @param context - The context of the summary
	 * @returns - The ID of the uploaded summary
	 */
	public override async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const prep = DocumentStorageServiceCompressionAdapter.compressSummary(
			summary,
			this._config,
			this._isUseB64OnCompressed,
		);
		return super.uploadSummaryWithContext(prep, context);
	}
}
