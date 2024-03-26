/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
	ISnapshotTree,
	ISummaryBlob,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
	SummaryObject,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import { compress, decompress } from "lz4js";
import { DocumentStorageServiceProxy } from "../../../documentStorageServiceProxy.js";
import { ICompressionStorageConfig, SummaryCompressionAlgorithm } from "..//index.js";

/**
 * @internal
 */
export const blobHeadersBlobName = ".metadata.blobHeaders";
const metadataBlobName = ".metadata";

/**
 * This class is a proxy for the IDocumentStorageService that compresses and decompresses blobs in the summary.
 * The identification of the compressed blobs is done by adding a compression markup blob to the summary.
 * Even if the markup blob is present, it does not mean that all blobs are compressed. The blob,
 * which is compressed also contain the compression algorithm enumerated value from the
 * SummaryCompressionAlgorithm enumeration in the first byte . If the blob is not
 * commpressed, it contains the first byte equals to SummaryCompressionAlgorithm.None .
 * In case, the markup blob is present, it is expected that the first byte of the markup blob
 * will contain the info about the compression. If the first byte is not present, it is assumed
 * that the compression is not enabled and no first prefix byte is present in the blobs.
 * @public
 */
export class DocumentStorageServiceCompressionAdapter extends DocumentStorageServiceProxy {
	private _isCompressionEnabled: boolean = false;

	constructor(
		service: IDocumentStorageService,
		private readonly _config: ICompressionStorageConfig,
	) {
		super(service);
	}

	public get service(): IDocumentStorageService {
		return this.internalStorageService;
	}

	/**
	 * This method returns `true` if there is a compression markup byte in the blob, otherwise `false`.
	 * @param blob - The blob to compress.
	 * @returns `true` if there is a compression markup byte in the blob, otherwise `false`.
	 */
	private static hasPrefix(blob: ArrayBufferLike): boolean {
		const firstByte = IsoBuffer.from(blob)[0];
		// eslint-disable-next-line no-bitwise
		return (firstByte & 0xf0) === 0xb0;
	}

	/**
	 * This method reads the first byte from the given blob and maps that byte to the compression algorithm.
	 * @param blob - The maybe compressed blob.
	 */
	private static readAlgorithmFromBlob(blob: ArrayBufferLike): number {
		return !this.hasPrefix(blob)
			? SummaryCompressionAlgorithm.None
			: // eslint-disable-next-line no-bitwise
			  IsoBuffer.from(blob)[0] & 0x0f;
	}

	/**
	 * This method writes the given algorithm to the blob as the first byte.
	 * @param blob - The blob to write the algorithm to.
	 * @param algorithm - The algorithm to write.
	 * @returns The blob with the algorithm as the first byte.
	 */
	private static writeAlgorithmToBlob(blob: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		if (algorithm === SummaryCompressionAlgorithm.None) {
			const firstByte = IsoBuffer.from(blob)[0];
			// eslint-disable-next-line no-bitwise
			if ((firstByte & 0xf0) !== 0xb0) {
				return blob;
			}
		}
		assert(algorithm < 0x10, 0x6f5 /* Algorithm should be less than 0x10 */);
		const blobView = new Uint8Array(blob);
		const blobLength = blobView.length;
		const newBlob = new Uint8Array(blobLength + 1);
		// eslint-disable-next-line no-bitwise
		const prefix = 0xb0 | algorithm;
		newBlob[0] = prefix;
		newBlob.set(blobView, 1);
		return IsoBuffer.from(newBlob);
	}

	/**
	 * This method removes the algorithm markup prefix from the blob (1 byte)
	 * @param blob - The blob to remove the prefix from.
	 * @returns The blob without the prefix.
	 */
	private static removePrefixFromBlobIfPresent(blob: ArrayBufferLike): ArrayBufferLike {
		const blobView = new Uint8Array(blob);
		return this.hasPrefix(blob) ? IsoBuffer.from(blobView.subarray(1)) : blob;
	}

	/**
	 * This method converts the given argument to Uint8Array. If the parameter is already Uint8Array,
	 * it is just returned as is. If the parameter is string, it is converted to Uint8Array using
	 * TextEncoder.
	 * @param input - The input to convert to Uint8Array.
	 * @returns The Uint8Array representation of the input.
	 */
	private static toBinaryArray(input: string | Uint8Array): Uint8Array {
		return typeof input === "string" ? new TextEncoder().encode(input) : input;
	}

	/**
	 * This method encodes the blob inside the given summary object of the SummaryType.Blob type using the given config
	 * containing  the compression algorithm.
	 * @param input - The summary object to encode.
	 * @param config - The config containing the compression algorithm.
	 * @returns The summary object with the encoded blob.
	 */
	private static readonly blobEncoder = (
		input: SummaryObject,
		config: ICompressionStorageConfig,
	): SummaryObject => {
		if (input.type === SummaryType.Blob) {
			const summaryBlob: ISummaryBlob = input;
			const original: ArrayBufferLike =
				DocumentStorageServiceCompressionAdapter.toBinaryArray(summaryBlob.content);
			const processed: ArrayBufferLike = DocumentStorageServiceCompressionAdapter.encodeBlob(
				original,
				config,
			);
			const newSummaryBlob = {
				type: SummaryType.Blob,
				content: IsoBuffer.from(processed),
			};
			return newSummaryBlob;
		} else {
			return input;
		}
	};

	/**
	 * This method decodes the blob inside the given summary object of the SummaryType.Blob type.
	 * @param input - The summary object to decode.
	 * @returns The summary object with the decoded blob.
	 */
	private static readonly blobDecoder = (input: SummaryObject): SummaryObject => {
		if (input.type === SummaryType.Blob) {
			const summaryBlob: ISummaryBlob = input;
			const original: Uint8Array = DocumentStorageServiceCompressionAdapter.toBinaryArray(
				summaryBlob.content,
			);
			const processed: ArrayBufferLike =
				DocumentStorageServiceCompressionAdapter.decodeBlob(original);
			const newSummaryBlob = {
				type: SummaryType.Blob,
				content: IsoBuffer.from(processed),
			};
			return newSummaryBlob;
		} else {
			return input;
		}
	};

	/**
	 * This method encodes the given blob according to the given config.
	 * @param file - The blob to encode.
	 * @param config - The config to use for encoding.
	 * @returns The encoded blob.
	 */
	private static encodeBlob(
		file: ArrayBufferLike,
		config: ICompressionStorageConfig,
	): ArrayBufferLike {
		let maybeCompressed: ArrayBufferLike;
		let algorithm = config.algorithm;
		if (new Uint8Array(file).length < config.minSizeToCompress) {
			maybeCompressed = file;
			algorithm = SummaryCompressionAlgorithm.None;
		} else if (algorithm === SummaryCompressionAlgorithm.None) {
			maybeCompressed = file;
		} else if (algorithm === SummaryCompressionAlgorithm.LZ4) {
			const compressed = compress(file) as ArrayBufferLike;
			maybeCompressed = compressed;
		} else {
			throw new Error(`Unknown Algorithm ${config.algorithm}`);
		}
		maybeCompressed = DocumentStorageServiceCompressionAdapter.writeAlgorithmToBlob(
			maybeCompressed,
			algorithm,
		);
		return maybeCompressed;
	}

	/**
	 * This method decodes the given blob.
	 * @param file - The blob to decode.
	 * @returns The decoded blob.
	 */
	private static decodeBlob(file: ArrayBufferLike): ArrayBufferLike {
		let decompressed: ArrayBufferLike;
		let originalBlob;
		let algorithm;
		if (this.hasPrefix(file)) {
			algorithm = DocumentStorageServiceCompressionAdapter.readAlgorithmFromBlob(file);
			originalBlob = this.removePrefixFromBlobIfPresent(file);
		} else {
			algorithm = SummaryCompressionAlgorithm.None;
			originalBlob = file;
		}
		if (algorithm === SummaryCompressionAlgorithm.None) {
			decompressed = originalBlob;
		} else if (algorithm === SummaryCompressionAlgorithm.LZ4) {
			decompressed = decompress(originalBlob) as ArrayBufferLike;
		} else {
			throw new Error(`Unknown Algorithm ${algorithm}`);
		}
		return decompressed;
	}

	/**
	 * This method traverses the SummaryObject recursively. If it finds the ISummaryBlob object,
	 * it applies encoding/decoding on it according to the given isEncode flag.
	 * @param isEncode - True if the encoding should be applied, false if the decoding should be applied.
	 * @param input - The summary object to traverse.
	 * @param encoder - The encoder function to use.
	 * @param decoder - The decoder function to use.
	 * @param config - The config to use for encoding.
	 * @param context - The summary context.
	 * @returns The summary object with the encoded/decoded blob.
	 */
	private static recursivelyReplace(
		isEncode: boolean,
		input: SummaryObject,
		encoder: (input: SummaryObject, config: ICompressionStorageConfig) => SummaryObject,
		decoder: (input: SummaryObject) => SummaryObject,
		config: ICompressionStorageConfig,
		context?: ISummaryContext,
	): SummaryObject {
		assert(typeof input === "object", 0x6f6 /* input must be a non-null object */);
		const maybeReplaced = isEncode ? encoder(input, config) : decoder(input);

		if (maybeReplaced !== input) {
			return maybeReplaced;
		}
		let clone: object | undefined;
		for (const key of Object.keys(input)) {
			const value = input[key];

			if (Boolean(value) && typeof value === "object") {
				const replaced = this.recursivelyReplace(
					isEncode,
					value as SummaryObject,
					encoder,
					decoder,
					config,
					context,
				);
				if (replaced !== value) {
					clone = clone ?? (Array.isArray(input) ? [...input] : { ...input });
					clone[key] = replaced;
				}
			}
		}
		return (clone ?? input) as SummaryObject;
	}

	/**
	 * This method traverses the SummaryTree recursively. If it finds the ISummaryBlob object with the key '.metadata',
	 * it returns the summary tree containing that blob.
	 *
	 * @param summary - The summary tree to traverse.
	 * @returns The summary tree containing the metadata blob.
	 */
	private static findMetadataHolderSummary(summary: ISummaryTree): ISummaryTree | undefined {
		assert(typeof summary === "object", 0x6f7 /* summary must be a non-null object */);
		for (const key of Object.keys(summary.tree)) {
			const value = summary.tree[key];

			if (Boolean(value) && value.type === SummaryType.Tree) {
				const found = this.findMetadataHolderSummary(value);
				if (found) {
					return found;
				}
			}
			if (Boolean(value) && key === metadataBlobName && value.type === SummaryType.Blob) {
				return summary;
			}
		}
		return undefined;
	}

	/**
	 * This method obtains the summary tree containing the metadata blob. It returns the content
	 * of the tree atribute.
	 * @param summary - The summary tree to traverse.
	 * @returns The content of the tree attribute of the summary tree containing the metadata blob.
	 */
	private static getMetadataHolderTree(summary: ISummaryTree) {
		const metadataHolder = this.findMetadataHolderSummary(summary);
		assert(metadataHolder !== undefined, 0x6f8 /* metadataHolder must be a non-null object */);
		const metadataHolderTree = metadataHolder.tree;
		return metadataHolderTree;
	}

	/**
	 * This method adds the compression markup blob to the nested summary tree containing the metadata blob.
	 * @param summary - The top summary tree to put the compression markup blob into.
	 */
	private static putCompressionMarkup(summary: ISummaryTree): void {
		const metadataHolderTree =
			DocumentStorageServiceCompressionAdapter.getMetadataHolderTree(summary);
		metadataHolderTree[blobHeadersBlobName] = {
			type: 2,
			content: "",
		};
	}

	/**
	 * This method traverses the SnapshotTree recursively. If it finds the ISummaryBlob object with the key '.metadata',
	 * it checks, if the SummaryTree holder of that object also contains the compression markup blob. If it is found,
	 * it returns true, otherwise false.
	 * @param snapshot - The snapshot tree to traverse.
	 * @returns True if the compression markup blob is found, otherwise false.
	 */
	private static hasCompressionMarkup(snapshot: ISnapshotTree): boolean {
		assert(typeof snapshot === "object", 0x6f9 /* snapshot must be a non-null object */);
		for (const key of Object.keys(snapshot.blobs)) {
			if (key === metadataBlobName) {
				const value = snapshot.blobs[blobHeadersBlobName];
				if (value !== undefined) {
					return true;
				}
			}
		}
		for (const key of Object.keys(snapshot.trees)) {
			const value = snapshot[key] as ISnapshotTree;
			if (value !== undefined) {
				const found = this.hasCompressionMarkup(value);
				if (found) {
					return found;
				}
			}
		}
		return false;
	}

	/**
	 * This method performs compression of the blobs in the summary tree.
	 * @param summary - The summary tree to compress.
	 * @param config - The compression config.
	 * @returns The compressed summary tree.
	 */
	public static compressSummary(
		summary: ISummaryTree,
		config: ICompressionStorageConfig,
	): ISummaryTree {
		this.putCompressionMarkup(summary);
		const prep = DocumentStorageServiceCompressionAdapter.recursivelyReplace(
			true,
			summary,
			DocumentStorageServiceCompressionAdapter.blobEncoder,
			DocumentStorageServiceCompressionAdapter.blobDecoder,
			config,
		) as ISummaryTree;
		//	console.log(`Miso summary-blob Summary Upload: ${JSON.stringify(prep).length}`);
		return prep;
	}

	/**
	 * This method read blob from the storage and decompresses it if it is compressed.
	 * @param id - The id of the blob to read.
	 * @returns The decompressed blob.
	 */
	public override async readBlob(id: string): Promise<ArrayBufferLike> {
		const originalBlob = await super.readBlob(id);
		if (!this._isCompressionEnabled) {
			return originalBlob;
		} else {
			const decompressedBlob =
				DocumentStorageServiceCompressionAdapter.decodeBlob(originalBlob);
			//			console.log(`Miso summary-blob Blob read END : ${id} ${decompressedBlob.byteLength}`);
			return decompressedBlob;
		}
	}

	/**
	 * This method loads the snapshot tree from the server. It also checks, if the compression markup blob is present
	 * and setups the compression flag accordingly. It also identifies the blobs that are not compressed and do not contain
	 * algorithm byte prefix and store them.
	 * @param version - The version of the snapshot tree to load.
	 * @param scenarioName - The scenario name of the snapshot tree to load.
	 * @returns The snapshot tree.
	 */
	public override async getSnapshotTree(
		version?: IVersion | undefined,
		scenarioName?: string | undefined,
		// eslint-disable-next-line @rushstack/no-new-null
	): Promise<ISnapshotTree | null> {
		const snapshotTree = await super.getSnapshotTree(version, scenarioName);
		this._isCompressionEnabled =
			snapshotTree !== undefined &&
			snapshotTree !== null &&
			DocumentStorageServiceCompressionAdapter.hasCompressionMarkup(snapshotTree);
		return snapshotTree;
	}

	/**
	 * This method uploads the summary to the storage. It performs compression of the blobs in the summary tree.
	 * @param summary - The summary tree to upload.
	 * @param context - The summary context.
	 * @returns The ID of the uploaded summary.
	 */
	public override async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const prep = DocumentStorageServiceCompressionAdapter.compressSummary(
			summary,
			this._config,
		);
		return super.uploadSummaryWithContext(prep, context);
	}

	/**
	 * This method downloads the summary from the storage and then applies decompression on the compressed blobs.
	 * @param id - The ID of the summary to be downloaded
	 * @returns The summary with decompressed blobs
	 */
	public override async downloadSummary(id: ISummaryHandle): Promise<ISummaryTree> {
		const summary = await super.downloadSummary(id);
		return !this._isCompressionEnabled
			? summary
			: (DocumentStorageServiceCompressionAdapter.recursivelyReplace(
					false,
					summary,
					DocumentStorageServiceCompressionAdapter.blobEncoder,
					DocumentStorageServiceCompressionAdapter.blobDecoder,
					this._config,
			  ) as ISummaryTree);
	}
}
