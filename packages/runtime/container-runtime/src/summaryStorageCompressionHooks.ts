import { deflate, inflate } from "pako";
import { compress, decompress } from "lz4js";
import { ISummaryContext } from "@fluidframework/driver-definitions";
import { ISummaryTree, ISnapshotTree, ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { Uint8ArrayToString } from "@fluidframework/common-utils";
import { getBlobAtPath, listBlobPaths, replaceSummaryObject, SummaryStorageHooks } from "./summaryStorageAdapter";
import { BlobHeaderBuilder, readBlobHeader, skipHeader, writeBlobHeader } from "./summaryBlobProtocol";

export enum Algorithms {
    NONE = 1,
    LZ4 = 2,
    DEFLATE = 3,
}

const ALGORITHM_KEY = "ALG";

function cloneSummary(summary: ISummaryTree): ISummaryTree {
    return JSON.parse(JSON.stringify(summary)) as ISummaryTree;
}

export class CompressionSummaryStorageHooks implements SummaryStorageHooks {
    constructor(private readonly _algorithm: Algorithms) { }
    public onPreCreateBlob(file: ArrayBufferLike): ArrayBufferLike {
        return this.encodeBlob(file);
    }
    public onPostReadBlob(file: ArrayBufferLike): ArrayBufferLike {
        return this.decodeBlob(file);
    }
    public onPreUploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext):
    { prepSummary: ISummaryTree; prepContext: ISummaryContext; } {
        const newSummary = cloneSummary(summary);
        const paths: string[][] = [];
        const currentPath: string[] = [];
        listBlobPaths(paths, currentPath, newSummary);
        paths.forEach((path) => {
            const summaryBlob: ISummaryBlob = getBlobAtPath(summary, path);
            let decompressed: Uint8Array;
            if (typeof summaryBlob.content === "string") {
                decompressed = new TextEncoder().encode(summaryBlob.content);
            } else {
                decompressed = summaryBlob.content;
            }
            const compressed: ArrayBufferLike = this.encodeBlob(decompressed);
            const compressedString = Uint8ArrayToString(Buffer.from(compressed), "base64");
            const compressedEncoded = new TextEncoder().encode(compressedString);
            const newSummaryBlob: ISummaryBlob = { type: SummaryType.Blob, content: compressedEncoded };
            replaceSummaryObject(newSummary, path, newSummaryBlob);
        });
        return { prepSummary: newSummary, prepContext: context };
    }
    public onPostGetSnapshotTree(tree: ISnapshotTree | null): ISnapshotTree | null {
        return tree;
    }
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
            const compressedString = new TextDecoder().decode(compressedEncoded);
            compressedEncoded = Buffer.from(compressedString, "base64");
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
