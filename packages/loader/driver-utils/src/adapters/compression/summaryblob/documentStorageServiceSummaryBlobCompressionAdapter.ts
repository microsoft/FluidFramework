/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer, Uint8ArrayToString, assert } from "@fluidframework/common-utils";
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
import { DocumentStorageServiceProxy } from "../../../documentStorageServiceProxy";
import { ICompressionStorageConfig, SummaryCompressionAlgorithm } from "../";

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
 */
export class DocumentStorageServiceCompressionAdapter extends DocumentStorageServiceProxy {
	private _isCompressionEnabled: boolean = false;
	private readonly _uncompressedBlobIds: Set<string> = new Set<string>();
	private static readonly compressionMarkupBlob = ".summary-blob-compression.enabled";
	private static readonly defaultIsUseB64OnCompressed = true;
	private static readonly uncompressedPath = ".protocol";

	constructor(
		service: IDocumentStorageService,
		private readonly _config: ICompressionStorageConfig,
		private readonly _isUseB64OnCompressed = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
	) {
		super(service);
	}

	public get service(): IDocumentStorageService {
		return this.internalStorageService;
	}

	/**
	 * This method reads the first byte from the given blob and maps that byte to the compression algorithm.
	 * @param blob - The maybe compressed blob.
	 */
	private static readAlgorithmFromBlob(blob: ArrayBufferLike): number {
		return new DataView(blob).getUint8(0);
	}

	/**
	 * This method writes the given algorithm to the blob as the first byte.
	 * @param blob - The blob to write the algorithm to.
	 * @param algorithm - The algorithm to write.
	 * @returns - The blob with the algorithm as the first byte.
	 */
	private static writeAlgorithmToBlob(blob: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		const blobView = new Uint8Array(blob);
		const blobLength = blobView.length;
		const newBlob = new Uint8Array(blobLength + 1);
		newBlob[0] = algorithm;
		newBlob.set(blobView, 1);
		return IsoBuffer.from(newBlob);
	}

	/**
	 * This method removes the algorithm markup prefix from the blob (1 byte)
	 * @param blob - The blob to remove the prefix from.
	 * @returns - The blob without the prefix.
	 */
	private static removePrefixFromBlob(blob: ArrayBufferLike): ArrayBufferLike {
		const blobView = new Uint8Array(blob);
		return IsoBuffer.from(blobView.subarray(1));
	}

	/**
	 * This method converts the given argument to Uint8Array. If the parameter is already Uint8Array,
	 * it is just returned as is. If the parameter is string, it is converted to Uint8Array using
	 * TextEncoder.
	 * @param input - The input to convert to Uint8Array.
	 * @returns - The Uint8Array representation of the input.
	 */
	private static toBinaryArray(input: string | Uint8Array): Uint8Array {
		return typeof input === "string" ? new TextEncoder().encode(input) : input;
	}

	/**
	 * This method tries to determine whether the given key found within the SummaryTree or SnapshotTree
	 * means that everything under that key is uncompressed and has no algorithm byte prefix written to
	 * the underlying blobs. If this method returns true, every blob which is found inside the sub-tree
	 * stored under this key is considered to be uncompressed and it should be simply returned as is.
	 * @param key - The key to check.
	 * @returns - True if the key means that everything under it is uncompressed.
	 */
	private static isKeyUncompressed(key: string): boolean {
		return key === DocumentStorageServiceCompressionAdapter.uncompressedPath;
	}

	/**
	 * This method traverses the SnapshotTree and identifies all the blobs which are uncompressed and have
	 * no algorithm byte prefix written to them. The method stores the blob ids of such blobs in the
	 * _uncompressedBlobIds set.
	 * @param snapshot - The snapshot to traverse.
	 * @param isUncompressedPath - True if the current path is uncompressed.
	 */
	private identifyUncompressedBlobs(
		snapshot: ISnapshotTree,
		isUncompressedPath: boolean = false,
	): void {
		for (const key of Object.keys(snapshot.trees)) {
			const obj = snapshot.trees[key];
			if (DocumentStorageServiceCompressionAdapter.isKeyUncompressed(key)) {
				this.identifyUncompressedBlobs(obj, true);
			} else {
				this.identifyUncompressedBlobs(obj, isUncompressedPath);
			}
		}
		for (const key of Object.keys(snapshot.blobs)) {
			const blobId = snapshot.blobs[key];
			if (blobId !== undefined && isUncompressedPath) {
				this._uncompressedBlobIds.add(blobId);
			}
		}
	}

	/**
	 * This method returns true if the blob identified by the given blobId is uncompressed and has no algorithm
	 * byte prefix written to it.
	 * @param blobId - The blob id to check.
	 * @returns - True if the blob is uncompressed.
	 */
	private isBlobUncompressed(blobId: string): boolean {
		const isUncompresssed = this._uncompressedBlobIds.has(blobId);
		return isUncompresssed;
	}

	/**
	 * This method encodes the blob inside the given summary object of the SummaryType.Blob type using the given config
	 * containing  the compression algorithm.
	 * @param input - The summary object to encode.
	 * @param config - The config containing the compression algorithm.
	 * @param isUseB64OnCompressed - True if the compressed blob should be converted to base64 string.
	 * @returns - The summary object with the encoded blob.
	 */
	private static readonly blobEncoder = (
		input: SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
	): SummaryObject => {
		if (input.type === SummaryType.Blob) {
			const summaryBlob: ISummaryBlob = input;
			const original: ArrayBufferLike =
				DocumentStorageServiceCompressionAdapter.toBinaryArray(summaryBlob.content);
			const processed: ArrayBufferLike = DocumentStorageServiceCompressionAdapter.encodeBlob(
				original,
				config,
				isUseB64OnCompressed,
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
	 * @returns - The summary object with the decoded blob.
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
	 * @param isUseB64OnCompressed - True if the compressed blob should be converted to base64.
	 * @returns - The encoded blob.
	 */
	private static encodeBlob(
		file: ArrayBufferLike,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean,
	): ArrayBufferLike {
		let maybeCompressed: ArrayBufferLike;
		let finalAlgorithm = SummaryCompressionAlgorithm.None;
		if (new Uint8Array(file).length < config.minSizeToCompress) {
			maybeCompressed = file;
		} else if (config.algorithm === SummaryCompressionAlgorithm.None) {
			maybeCompressed = file;
		} else if (config.algorithm === SummaryCompressionAlgorithm.LZ4) {
			let compressed = compress(file) as ArrayBufferLike;
			if (isUseB64OnCompressed) {
				// TODO: This step is now needed, it looks like the function summaryTreeUploadManager#writeSummarPyBlob
				// fails on assertion at 2 different generations of the hash which do not lead to
				// the same result if the ISummaryBlob.content is in the form of ArrayBufferLike
				const compressedString = Uint8ArrayToString(IsoBuffer.from(compressed), "base64");
				compressed = new TextEncoder().encode(compressedString);
			}
			finalAlgorithm = SummaryCompressionAlgorithm.LZ4;
			maybeCompressed = compressed;
		} else {
			throw new Error(`Unknown Algorithm ${config.algorithm}`);
		}
		maybeCompressed = DocumentStorageServiceCompressionAdapter.writeAlgorithmToBlob(
			maybeCompressed,
			finalAlgorithm,
		);
		return maybeCompressed;
	}

	/**
	 * This method decodes the given blob.
	 * @param file - The blob to decode.
	 * @returns - The decoded blob.
	 */
	private static decodeBlob(file: ArrayBufferLike): ArrayBufferLike {
		let decompressed: ArrayBufferLike;
		let compressedEncoded = file;
		const algorithm = DocumentStorageServiceCompressionAdapter.readAlgorithmFromBlob(file);
		const orignalBlob = this.removePrefixFromBlob(file);
		if (algorithm === SummaryCompressionAlgorithm.None) {
			decompressed = orignalBlob;
		} else if (algorithm === SummaryCompressionAlgorithm.LZ4) {
			try {
				decompressed = decompress(compressedEncoded) as ArrayBufferLike;
			} catch (e) {
				const compressedString = new TextDecoder().decode(orignalBlob);
				compressedEncoded = IsoBuffer.from(compressedString, "base64");
				decompressed = decompress(compressedEncoded) as ArrayBufferLike;
			}
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
	 * @param isUseB64OnCompressed - True if the compressed blob should be converted to base64.
	 * @param context - The summary context.
	 * @returns - The summary object with the encoded/decoded blob.
	 */
	private static recursivelyReplace(
		isEncode: boolean,
		input: SummaryObject,
		encoder: (
			input: SummaryObject,
			config: ICompressionStorageConfig,
			isUseB64OnCompressed: boolean,
		) => SummaryObject,
		decoder: (input: SummaryObject) => SummaryObject,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean,
		context?: ISummaryContext,
	): SummaryObject {
		assert(typeof input === "object", "input must be a non-null object");
		const maybeReplaced = isEncode
			? encoder(input, config, isUseB64OnCompressed)
			: decoder(input);

		if (maybeReplaced !== input) {
			return maybeReplaced;
		}
		let clone: object | undefined;
		for (const key of Object.keys(input)) {
			const value = input[key];

			if (
				Boolean(value) &&
				typeof value === "object" &&
				!DocumentStorageServiceCompressionAdapter.isKeyUncompressed(key)
			) {
				const replaced = this.recursivelyReplace(
					isEncode,
					value as SummaryObject,
					encoder,
					decoder,
					config,
					isUseB64OnCompressed,
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
	 * @returns - The summary tree containing the metadata blob.
	 */
	private static findMetadataHolderSummary(summary: ISummaryTree): ISummaryTree | undefined {
		assert(typeof summary === "object", "summary must be a non-null object");
		for (const key of Object.keys(summary.tree)) {
			const value = summary.tree[key];

			if (Boolean(value) && value.type === SummaryType.Tree) {
				const found = this.findMetadataHolderSummary(value);
				if (found) {
					return found;
				}
			}
			if (Boolean(value) && key === ".metadata" && value.type === SummaryType.Blob) {
				return summary;
			}
		}
		return undefined;
	}

	/**
	 * This method obtains the summary tree containing the metadata blob. It returns the content
	 * of the tree atribute.
	 * @param summary - The summary tree to traverse.
	 * @returns - The content of the tree attribute of the summary tree containing the metadata blob.
	 */
	private static getMetadataHolderTree(summary: ISummaryTree) {
		const metadataHolder = this.findMetadataHolderSummary(summary);
		assert(metadataHolder !== undefined, "metadataHolder must be a non-null object");
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
		metadataHolderTree[DocumentStorageServiceCompressionAdapter.compressionMarkupBlob] = {
			type: 2,
			content: "",
		};
	}

	/**
	 * This method traverses the SnapshotTree recursively. If it finds the ISummaryBlob object with the key '.metadata',
	 * it checks, if the SummaryTree holder of that object also contains the compression markup blob. If it is found,
	 * it returns true, otherwise false.
	 * @param snapshot - The snapshot tree to traverse.
	 * @returns - True if the compression markup blob is found, otherwise false.
	 */
	private static hasCompressionMarkup(snapshot: ISnapshotTree): boolean {
		assert(typeof snapshot === "object", "summary must be a non-null object");
		for (const key of Object.keys(snapshot.blobs)) {
			if (key === ".metadata") {
				const value =
					snapshot.blobs[DocumentStorageServiceCompressionAdapter.compressionMarkupBlob];
				if (value !== undefined) {
					return true;
				}
			}
		}
		for (const key of Object.keys(snapshot.trees)) {
			const value = snapshot[key] as ISnapshotTree;
			const found = this.hasCompressionMarkup(value);
			if (found) {
				return found;
			}
		}
		return false;
	}

	/**
	 * This method performs compression of the blobs in the summary tree.
	 * @param summary - The summary tree to compress.
	 * @param config - The compression config.
	 * @param isUseB64OnCompressed - If true, the compressed blobs are encoded in base64.
	 * @returns - The compressed summary tree.
	 */
	public static compressSummary(
		summary: ISummaryTree,
		config: ICompressionStorageConfig,
		isUseB64OnCompressed: boolean = DocumentStorageServiceCompressionAdapter.defaultIsUseB64OnCompressed,
	): ISummaryTree {
		this.putCompressionMarkup(summary);
		const prep = DocumentStorageServiceCompressionAdapter.recursivelyReplace(
			true,
			summary,
			DocumentStorageServiceCompressionAdapter.blobEncoder,
			DocumentStorageServiceCompressionAdapter.blobDecoder,
			config,
			isUseB64OnCompressed,
		) as ISummaryTree;
		console.log(`Miso Summary Upload: ${JSON.stringify(prep).length}`);
		return prep;
	}

	/**
	 * This method read blob from the storage and decompresses it if it is compressed.
	 * @param id - The id of the blob to read.
	 * @returns - The decompressed blob.
	 */
	public override async readBlob(id: string): Promise<ArrayBufferLike> {
		const originalBlob = await super.readBlob(id);
		// eslint-disable-next-line unicorn/prefer-ternary
		if (!this._isCompressionEnabled || this.isBlobUncompressed(id)) {
			return originalBlob;
		} else {
			return DocumentStorageServiceCompressionAdapter.decodeBlob(originalBlob);
		}
	}

	/**
	 * This method loads the snapshot tree from the server. It also checks, if the compression markup blob is present
	 * and setups the compression flag accordingly. It also identifies the blobs that are not compressed and do not contain
	 * algorithm byte prefix and store them.
	 * @param version - The version of the snapshot tree to load.
	 * @param scenarioName - The scenario name of the snapshot tree to load.
	 * @returns - The snapshot tree.
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
		if (snapshotTree !== null) {
			this.identifyUncompressedBlobs(snapshotTree);
		}
		return snapshotTree;
	}

	/**
	 * This method uploads the summary to the storage. It performs compression of the blobs in the summary tree.
	 * @param summary - The summary tree to upload.
	 * @param context - The summary context.
	 * @returns - The ID of the uploaded summary.
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

	/**
	 * This method downloads the summary from the storage and then applies decompression on the compressed blobs.
	 * @param id - The ID of the summary to be downloaded
	 * @returns - The summary with decompressed blobs
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
					this._isUseB64OnCompressed,
			  ) as ISummaryTree);
	}
}
