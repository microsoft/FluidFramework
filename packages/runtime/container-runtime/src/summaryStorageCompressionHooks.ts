/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { deflate, inflate } from "pako";
import { compress, decompress } from "lz4js";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, ISnapshotTree, ISummaryBlob, SummaryType, SummaryObject }
from "@fluidframework/protocol-definitions";
import { IsoBuffer, Uint8ArrayToString } from "@fluidframework/common-utils";
import { getBlobAtPath, listBlobPaths, replaceSummaryObject, SummaryStorageHooks } from "./summaryStorageAdapter";
import { BlobHeaderBuilder, readBlobHeader, skipHeader, writeBlobHeader } from "./summaryBlobProtocol";

export enum Algorithms {
    NONE = 1,
    LZ4 = 2,
    DEFLATE = 3,
}

const ALGORITHM_KEY = "ALG";

function summaryBlobReplacer(key: string, value: SummaryObject) {
    if (value.type === SummaryType.Blob) {
        return undefined;
    } else {
        return value;
    }
}

function cloneSummarySkipBlobs(summary: ISummaryTree): ISummaryTree {
    return JSON.parse(JSON.stringify(summary, summaryBlobReplacer)) as ISummaryTree;
}

/**
 * This class implements the SummaryStorageHooks which can apply various kinds of compressions
 * to the blob payload.
 */
export class CompressionSummaryStorageHooks implements SummaryStorageHooks {
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
        const newSummary = cloneSummarySkipBlobs(summary);
        const paths: string[][] = [];
        const currentPath: string[] = [];
        listBlobPaths(paths, currentPath, summary);
        paths.forEach((path) => {
            const summaryBlob: ISummaryBlob = getBlobAtPath(summary, path);
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
            replaceSummaryObject(newSummary, path, newSummaryBlob);
        });
        return { prepSummary: newSummary, prepContext: context };
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
        if (this._algorithm === Algorithms.NONE) {
            return file;
        } else
            if (this._algorithm === Algorithms.DEFLATE) {
                compressed = deflate(file) as ArrayBufferLike;
            } else
                if (this._algorithm === Algorithms.LZ4) {
                    compressed = compress(file) as ArrayBufferLike;
                } else {
                    throw Error(`Unknown Algorithm ${this._algorithm}`);
                }
        const headerBuilder: BlobHeaderBuilder = new BlobHeaderBuilder();
        headerBuilder.addField(ALGORITHM_KEY, this._algorithm.toString(10));
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
        const myAlgorithm = Number(header.getValue(ALGORITHM_KEY));
        if (myAlgorithm === Algorithms.DEFLATE) {
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
