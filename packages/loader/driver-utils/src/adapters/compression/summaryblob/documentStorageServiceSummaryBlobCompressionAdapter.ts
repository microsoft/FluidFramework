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

	private static writeAlgorithmToBlob(blob: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		const blobView = new Uint8Array(blob);
		const blobLength = blobView.length;
		const newBlob = new Uint8Array(blobLength + 1);
		newBlob[0] = algorithm;
		newBlob.set(blobView, 1);
		return IsoBuffer.from(newBlob);
	}

	private static removePrefixFromBlob(blob: ArrayBufferLike): ArrayBufferLike {
		const blobView = new Uint8Array(blob);
		return IsoBuffer.from(blobView.subarray(1));
	}

	private static toBinaryArray(input: string | Uint8Array): Uint8Array {
		return typeof input === "string" ? new TextEncoder().encode(input) : input;
	}

	private static isKeyUncompressed(key: string): boolean {
		return key === DocumentStorageServiceCompressionAdapter.uncompressedPath;
	}

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

	private isBlobUncompressed(blobId: string): boolean {
		const isUncompresssed = this._uncompressedBlobIds.has(blobId);
		return isUncompresssed;
	}

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
				DocumentStorageServiceCompressionAdapter.isKeyUncompressed(key)
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

	private static findMetadataHolderSnapshot(snapshot: ISnapshotTree): ISnapshotTree | undefined {
		assert(typeof snapshot === "object", "summary must be a non-null object");
		for (const key of Object.keys(snapshot.blobs)) {
			if (key === ".metadata") {
				return snapshot;
			}
		}
		for (const key of Object.keys(snapshot.trees)) {
			const value = snapshot[key] as ISnapshotTree;
			const found = this.findMetadataHolderSnapshot(value);
			if (found) {
				return found;
			}
		}
		return undefined;
	}

	private static getMetadataHolderTree(summary: ISummaryTree) {
		const metadataHolder = this.findMetadataHolderSummary(summary);
		assert(metadataHolder !== undefined, "metadataHolder must be a non-null object");
		const metadataHolderTree = metadataHolder.tree;
		return metadataHolderTree;
	}

	private static putCompressionMarkup(summary: ISummaryTree): void {
		const metadataHolderTree =
			DocumentStorageServiceCompressionAdapter.getMetadataHolderTree(summary);
		metadataHolderTree[DocumentStorageServiceCompressionAdapter.compressionMarkupBlob] = {
			type: 2,
			content: "",
		};
	}

	private static hasCompressionMarkup(snapshot: ISnapshotTree): boolean {
		const metadataHolder = this.findMetadataHolderSnapshot(snapshot);
		return (
			metadataHolder?.blobs[
				DocumentStorageServiceCompressionAdapter.compressionMarkupBlob
			] !== undefined
		);
	}

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

	public override async readBlob(id: string): Promise<ArrayBufferLike> {
		const originalBlob = await super.readBlob(id);
		// eslint-disable-next-line unicorn/prefer-ternary
		if (!this._isCompressionEnabled || this.isBlobUncompressed(id)) {
			return originalBlob;
		} else {
			return DocumentStorageServiceCompressionAdapter.decodeBlob(originalBlob);
		}
	}

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
