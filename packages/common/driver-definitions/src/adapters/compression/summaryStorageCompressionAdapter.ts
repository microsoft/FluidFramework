/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { compress, decompress } from "lz4js";
import {
	ISummaryTree,
	ISummaryBlob,
	SummaryType,
	ICreateBlobResponse,
	SummaryObject,
} from "@fluidframework/protocol-definitions";
import { IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "../../";
import { SummaryStorageAdapter } from "../summaryStorageAdapter";
import {
	BlobHeaderBuilder,
	readBlobHeader,
	skipHeader,
	writeBlobHeader,
} from "./summaryBlobProtocol";

export enum SummaryCompressionAlgorithm {
	None = 1,
	LZ4 = 2,
}

const algorithmKey = "ALG";
const defaultMinSizeToCompress = 500;

/**
 * This class extends the SummaryStorageAdapter so that it can apply various kinds of compressions
 * to the blob payload.
 */
export class CompressionSummaryStorageAdapter extends SummaryStorageAdapter {
	constructor(
		service: IDocumentStorageService,
		private readonly _algorithm: SummaryCompressionAlgorithm | undefined,
		private readonly _minSizeToCompress: number | undefined,
		private readonly _isUseB64OnCompressed: boolean | undefined,
	) {
		super(service);
		if (this._minSizeToCompress === undefined) {
			this._minSizeToCompress = defaultMinSizeToCompress;
		}
	}

	public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
		return super.createBlob(this.encodeBlob(file));
	}
	public async readBlob(id: string): Promise<ArrayBufferLike> {
		return this.decodeBlob(await super.readBlob(id));
	}
	public async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		const prep = {
			prepSummary: recursivelyReplace(summary, this.blobReplacer, context) as ISummaryTree,
			prepContext: context,
		};
		console.log(`Miso Summary Upload: ${  JSON.stringify(prep.prepSummary).length}`);
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
			if (this._isUseB64OnCompressed !== undefined && this._isUseB64OnCompressed) {
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				compressed = compress(file) as ArrayBufferLike;
			} else {
				throw new Error(`Unknown Algorithm ${this._algorithm}`);
			}
		}
		const headerBuilder: BlobHeaderBuilder = new BlobHeaderBuilder();
		headerBuilder.addField(algorithmKey, this._algorithm.toString(10));
		return writeBlobHeader(headerBuilder.build(), compressed);
	}

	private decodeBlob(file: ArrayBufferLike): ArrayBufferLike {
		let compressedEncoded = file;
		let header = readBlobHeader(compressedEncoded);
		if (!header) {
			// TODO: Due to the function summaryTreeUploadManager#writeSummaryBlob issue
			// where the binary blob representation inside ISummaryTree causes assertion issues
			// with the hash comparison we need to be prepared that the blob together with the
			// blob header is base64 encoded. We need to try whether it is the case.
			const compressedString = new TextDecoder().decode(compressedEncoded);
			compressedEncoded = IsoBuffer.from(compressedString, "base64");
			header = readBlobHeader(compressedEncoded);
			if (!header) {
				return file;
			}
		}
		let decompressed: ArrayBufferLike;
		const input = skipHeader(compressedEncoded);
		const myAlgorithm = Number(header.getValue(algorithmKey));
		if (myAlgorithm === SummaryCompressionAlgorithm.LZ4) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			decompressed = decompress(input) as ArrayBufferLike;
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
