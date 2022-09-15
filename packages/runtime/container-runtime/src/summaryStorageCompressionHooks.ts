/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */

import { deflate, inflate } from "pako";
import { compress, decompress } from "lz4js";
import { ISummaryContext } from "@fluidframework/driver-definitions";
// import { ISummaryTree, ISnapshotTree, ISummaryBlob, SummaryType, SummaryObject }
import { ISummaryTree, ISnapshotTree, ISummaryBlob, SummaryType }
    from "@fluidframework/protocol-definitions";
import { IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
// import { getBlobAtPath, listBlobPaths, replaceSummaryObject, SummaryStorageHooks } from "./summaryStorageAdapter";
import { SummaryStorageHooks } from "./summaryStorageAdapter";
import { BlobHeaderBuilder, readBlobHeader, skipHeader, writeBlobHeader } from "./summaryBlobProtocol";

export enum Algorithms {
    None = 1,
    LZ4 = 2,
    Deflate = 3,
}

const algorithmKey = "ALG";

/**
 * This class implements the SummaryStorageHooks which can apply various kinds of compressions
 * to the blob payload.
 */
export class CompressionSummaryStorageHooks implements SummaryStorageHooks {
    private readonly blobReplacer = (input: any, context: any) => {
        if (input.type === SummaryType.Blob) {
            const summaryBlob: ISummaryBlob = input;
            let decompressed: Uint8Array;
            if (typeof summaryBlob.content === "string") {
                decompressed = new TextEncoder().encode(summaryBlob.content);
            } else {
                decompressed = summaryBlob.content;
            }
            const compressed: ArrayBufferLike = this.encodeBlob(decompressed);
            // TODO: This step is now needed, it looks like the function summaryTreeUploadManager#writeSummaryBlob
            // fails on assertion at 2 different generations of the hash which do not lead to
            // the same result if the ISummaryBlob.content is in the form of ArrayBufferLike
            const compressedString = Uint8ArrayToString(IsoBuffer.from(compressed), "base64");
            const compressedEncoded = new TextEncoder().encode(compressedString);
            const newSummaryBlob: ISummaryBlob = { type: SummaryType.Blob, content: compressedEncoded };
            // This line will replace the 3 lines above when the bug is fixed.
            // const newSummaryBlob: ISummaryBlob = { type: SummaryType.Blob, content: IsoBuffer.from(compressed)};
            return newSummaryBlob;
        } else {
            return input;
        }
    };
    constructor(private readonly _algorithm: Algorithms) { }
    public onPreCreateBlob(file: ArrayBufferLike): ArrayBufferLike {
        return this.encodeBlob(file);
    }
    public onPostReadBlob(file: ArrayBufferLike): ArrayBufferLike {
        return this.decodeBlob(file);
    }

    /**
     * All paths of ISummaryTree which lead to ISummaryBlob objects are iterated.
     * At each ISummaryBlob, content is mapped to binary array and compressed.
     * The header is then addded which shows, which algorithm was used for encryption.
     * The result binary is base64 encoded due to the issue with summaryTreeUploadManager#writeSummaryBlob
     * hash assertion
     * New ISummaryBlob is created with the new string content obtained in the above step and the
     * old blob is replaced by this new blob in the ISummaryTree.
     */
    public onPreUploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext):
        { prepSummary: ISummaryTree; prepContext: ISummaryContext; } {
        return { prepSummary: recursivelyReplace(summary, this.blobReplacer, context), prepContext: context };
    }
    /**
     * TODO: This method is not yet implemented
     */
    public onPostGetSnapshotTree(tree: ISnapshotTree | null): ISnapshotTree | null {
        return tree;
    }
    /**
     * TODO: This method is not yet implemented
     */
    public onPostDownloadSummary(summary: ISummaryTree): ISummaryTree {
        return summary;
    }

    private encodeBlob(file: ArrayBufferLike): ArrayBufferLike {
        let compressed: ArrayBufferLike;
        if (this._algorithm === Algorithms.None) {
            return file;
        } else {
            if (this._algorithm === Algorithms.Deflate) {
                compressed = deflate(file) as ArrayBufferLike;
            } else {
                if (this._algorithm === Algorithms.LZ4) {
                    compressed = compress(file) as ArrayBufferLike;
                } else {
                    throw Error(`Unknown Algorithm ${this._algorithm}`);
                }
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
        if (myAlgorithm === Algorithms.Deflate) {
            decompressed = inflate(input) as ArrayBufferLike;
        } else
            if (myAlgorithm === Algorithms.LZ4) {
                decompressed = decompress(input) as ArrayBufferLike;
            } else {
                throw Error(`Unknown Algorithm ${this._algorithm}`);
            }
        return decompressed;
    }
}

export function recursivelyReplace(
    input: any,
    replacer: (input: any, context: any) => any,
    context?: any,
) {
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

        if (!!value && typeof value === "object") {
            // Note: Except for IFluidHandle, `input` must not contain circular references (as object must
            //       be JSON serializable.)  Therefore, guarding against infinite recursion here would only
            //       lead to a later error when attempting to stringify().
            const replaced = recursivelyReplace(value, replacer, context);

            // If the `replaced` object is different than the original `value` then the subgraph contained one
            // or more handles.  If this happens, we need to return a clone of the `input` object where the
            // current property is replaced by the `replaced` value.
            if (replaced !== value) {
                // Lazily create a shallow clone of the `input` object if we haven't done so already.
                clone = clone ?? (Array.isArray(input)
                    ? [...input]
                    : { ...input });

                // Overwrite the current property `key` in the clone with the `replaced` value.
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                clone![key] = replaced;
            }
        }
    }
    return clone ?? input;
}
