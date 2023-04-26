/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
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
 * This class extends the SummaryStorageAdapter so that it can apply various kinds of compressions
 * to the blob payload.
 */
export class DocumentStorageServiceCompressionAdapter extends DocumentStorageServiceProxy {
	private readonly _algorithm: SummaryCompressionAlgorithm;
	private readonly _minSizeToCompress: number;
	private readonly _compressedBlobIds: Map<string, number> = new Map();
	private readonly compressed_prefix: string = "compressed_";
	private readonly lz4_prefix: string = "LZ4_";

	constructor(
		service: IDocumentStorageService,
		private readonly _config: ICompressionStorageConfig,
		private readonly _isUseB64OnCompressed = true,
	) {
		super(service);
		this._algorithm = this._config.algorithm;
		this._minSizeToCompress = this._config.minSizeToCompress;
	}

	private hasCompression(name: string): boolean {
		return name.trim().startsWith(this.compressed_prefix);
	}

	/**
	 * This method checks whether the given name has compression. If it has no compression
	 * it throws an error. Otherwise it checks, whether it contains lz4 algorithm, in that case
	 * returns true, otherwise false
	 * @param name - The path of the blob
	 */
	private extractAlgorithm(name: string): number {
		const algorithmStr = this.extractAlgorithmString(name);
		return algorithmStr === this.lz4_prefix
			? SummaryCompressionAlgorithm.LZ4
			: SummaryCompressionAlgorithm.None;
	}

	private extractAlgorithmString(name: string): string | undefined {
		if (!this.hasCompression(name)) {
			throw new Error("Blob has no compression");
		}
		const trimmedName = name.trim().substring(0, this.compressed_prefix.length);
		return trimmedName.startsWith(this.lz4_prefix) ? this.lz4_prefix : undefined;
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
		let decoded = name.trim().substring(this.compressed_prefix.length);

		const algorithmStr = this.extractAlgorithmString(name);
		if (algorithmStr !== undefined) {
			decoded = decoded.substring(algorithmStr.length);
		}
		return decoded;
	}

	public override async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return super.createBlob(this.encodeBlob(file));
	}

	public async decodeSnapshotBlobNames(snapshot: ISnapshotTree): Promise<void> {
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
		return this.decodeBlob(await super.readBlob(id), algorithm);
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
		const prep = {
			prepSummary: recursivelyReplace(summary, this.blobReplacer, context) as ISummaryTree,
			prepContext: context,
		};
		console.log(`Miso Summary Upload: ${JSON.stringify(prep.prepSummary).length}`);
		return super.uploadSummaryWithContext(prep.prepSummary, prep.prepContext);
	}
	public get algorithm(): SummaryCompressionAlgorithm | undefined {
		return this._algorithm;
	}
	private readonly blobReplacer = (
		_input: SummaryObject,
		_context?: ISummaryContext,
	): SummaryObject => {
		if (_input.type === SummaryType.Blob) {
			const summaryBlob: ISummaryBlob = _input;
			const decompressed: Uint8Array =
				typeof summaryBlob.content === "string"
					? new TextEncoder().encode(summaryBlob.content)
					: summaryBlob.content;
			if (
				this._minSizeToCompress !== undefined &&
				decompressed.length < this._minSizeToCompress
			) {
				return _input;
			}
			const compressed: ArrayBufferLike = this.encodeBlob(decompressed);
			let newSummaryBlob;
			if (this._isUseB64OnCompressed) {
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
				// This line will replace the 3 lines above when the bug is fixed.
				// const newSummaryBlob: ISummaryBlob = { type: SummaryType.Blob, content: IsoBuffer.from(compressed)};
				newSummaryBlob = {
					type: SummaryType.Blob,
					content: IsoBuffer.from(compressed),
				};
			}
			return newSummaryBlob;
		} else {
			return _input;
		}
	};

	private encodeBlob(file: ArrayBufferLike): ArrayBufferLike {
		let compressed: ArrayBufferLike;
		if (this._algorithm === undefined || this._algorithm === SummaryCompressionAlgorithm.None) {
			return file;
		} else {
			if (this._algorithm === SummaryCompressionAlgorithm.LZ4) {
				compressed = compress(file) as ArrayBufferLike;
			} else {
				throw new Error(`Unknown Algorithm ${this._algorithm}`);
			}
		}
		return compressed;
	}

	private decodeBlob(file: ArrayBufferLike, algorithm: number): ArrayBufferLike {
		let decompressed: ArrayBufferLike;
		if (algorithm === SummaryCompressionAlgorithm.LZ4) {
			decompressed = decompress(file) as ArrayBufferLike;
		} else {
			throw new Error(`Unknown Algorithm ${this._algorithm}`);
		}
		return decompressed;
	}
}

export function recursivelyReplace(
	input: SummaryObject,
	replacer: (input: SummaryObject, context?: ISummaryContext) => SummaryObject,
	context?: ISummaryContext,
): SummaryObject {
	// Note: Caller is responsible for ensuring that `input` is defined / non-null.
	//       (Required for Object.keys() below.)

	// Execute the `replace` on the current input.  Note that Caller is responsible for ensuring that `input`
	// is a non-null object.
	const maybeReplaced = replacer(input, context);

	// If the replacer made a substitution there is no need to decscend further. IFluidHandles are always
	// leaves in the object graph.
	if (maybeReplaced !== input) {
		return maybeReplaced;
	}

	// Otherwise descend into the object graph looking for IFluidHandle instances.
	let clone: object | undefined;
	for (const key of Object.keys(input)) {
		const value = input[key];

		if (Boolean(value) && typeof value === "object") {
			// Note: `input` must not contain circular references (as object must
			//       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
			//       lead to a later error when attempting to stringify().
			const replaced = recursivelyReplace(value as SummaryObject, replacer, context);

			// If the `replaced` object is different than the original `value` then the subgraph contained one
			// or more handles.  If this happens, we need to return a clone of the `input` object where the
			// current property is replaced by the `replaced` value.
			if (replaced !== value) {
				// Lazily create a shallow clone of the `input` object if we haven't done so already.
				clone = clone ?? (Array.isArray(input) ? [...input] : { ...input });

				// Overwrite the current property `key` in the clone with the `replaced` value.
				clone[key] = replaced;
			}
		}
	}
	return (clone ?? input) as SummaryObject;
}
