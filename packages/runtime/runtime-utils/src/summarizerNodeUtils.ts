import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import {
    ISnapshotTree,
    IDocumentAttributes,
    ISequencedDocumentMessage,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { SummaryTreeBuilder } from "./summaryUtils";

const baseSummaryTreeKey = "_baseSummary";
const outstandingOpsBlobKey = "_outstandingOps";
const maxDecodeDepth = 100;

/** Reads a blob from storage and parses it from JSON. */
export type ReadAndParseBlob = <T>(id: string) => Promise<T>;

/**
 * Fetches the sequence number of the snapshot tree by examining the protocol.
 * @param tree - snapshot tree to examine
 * @param readAndParseBlob - function to read blob contents from storage
 * and parse the result from JSON.
 */
export async function seqFromTree(
    tree: ISnapshotTree,
    readAndParseBlob: ReadAndParseBlob,
): Promise<number> {
    const attributesHash = tree.trees[".protocol"].blobs.attributes;
    const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
    return attrib.sequenceNumber;
}

/** Path for nodes in a tree with escaped special characters */
export class EscapedPath {
    private constructor(public readonly path: string) { }
    public static create(path: string): EscapedPath {
        return new EscapedPath(encodeURIComponent(path));
    }
    public static createAndConcat(pathParts: string[]): EscapedPath {
        let ret = EscapedPath.create(pathParts[0] ?? "");
        for (let i = 1; i < pathParts.length; i++) {
            ret = ret.concat(EscapedPath.create(pathParts[i]));
        }
        return ret;
    }
    public toString(): string {
        return this.path;
    }
    public concat(path: EscapedPath): EscapedPath {
        return new EscapedPath(`${this.path}/${path.path}`);
    }
}

/** Information about a summary relevant to a specific node in the tree */
export class SummaryNode {
    public static createForRoot(referenceSequenceNumber: number): SummaryNode {
        return new SummaryNode({
            referenceSequenceNumber,
            basePath: undefined,
            localPath: EscapedPath.create(""), // root hard-coded to ""
        });
    }

    public get referenceSequenceNumber(): number {
        return this.summary.referenceSequenceNumber;
    }
    public get basePath(): EscapedPath | undefined {
        return this.summary.basePath;
    }
    public get localPath(): EscapedPath {
        return this.summary.localPath;
    }
    public get additionalPath(): EscapedPath | undefined {
        return this.summary.additionalPath;
    }
    public set additionalPath(additionalPath: EscapedPath | undefined) {
        this.summary.additionalPath = additionalPath;
    }
    constructor(private readonly summary: {
        readonly referenceSequenceNumber: number,
        readonly basePath: EscapedPath | undefined,
        readonly localPath: EscapedPath,
        additionalPath?: EscapedPath,
    }) { }

    public get fullPath(): EscapedPath {
        return this.basePath?.concat(this.localPath) ?? this.localPath;
    }

    public get fullPathForChildren(): EscapedPath {
        return this.additionalPath !== undefined
            ? this.fullPath.concat(this.additionalPath)
            : this.fullPath;
    }

    public createForChild(id: string): SummaryNode {
        return new SummaryNode({
            referenceSequenceNumber: this.referenceSequenceNumber,
            basePath: this.fullPathForChildren,
            localPath: EscapedPath.create(id),
        });
    }
}

interface IDecodedSummary {
    readonly baseSummary: ISnapshotTree;
    readonly pathParts: string[];
    getOutstandingOps(readAndParseBlob: ReadAndParseBlob): Promise<ISequencedDocumentMessage[]>;
}

/**
 * Checks if the snapshot is created by referencing a previous successful
 * summary plus outstanding ops. If so, it will recursively "decode" it until
 * it gets to the last successful summary (the base summary) and returns that
 * as well as a function for fetching the outstanding ops. Also returns the
 * full path to the previous base summary for child summarizer nodes to use as
 * their base path when necessary.
 * @param snapshot - snapshot tree to decode
 */
export function decodeSummary(
    snapshot: ISnapshotTree,
    logger: Pick<ITelemetryLogger, "sendTelemetryEvent">,
): IDecodedSummary {
    let baseSummary = snapshot;
    const pathParts: string[] = [];
    const opsBlobs: string[] = [];

    for (let i = 0; ; i++) {
        if (i > maxDecodeDepth) {
            logger.sendTelemetryEvent({
                eventName: "DecodeSummaryMaxDepth",
                maxDecodeDepth,
            });
        }
        const outstandingOpsBlob = baseSummary.blobs[outstandingOpsBlobKey];
        const newBaseSummary = baseSummary.trees[baseSummaryTreeKey];
        if (outstandingOpsBlob === undefined && newBaseSummary === undefined) {
            return {
                baseSummary,
                pathParts,
                async getOutstandingOps(readAndParseBlob: ReadAndParseBlob) {
                    let outstandingOps: ISequencedDocumentMessage[] = [];
                    for (const opsBlob of opsBlobs) {
                        const newOutstandingOps = await readAndParseBlob<ISequencedDocumentMessage[]>(opsBlob);
                        if (outstandingOps.length > 0 && newOutstandingOps.length > 0) {
                            const latestSeq = outstandingOps[outstandingOps.length - 1].sequenceNumber;
                            const newEarliestSeq = newOutstandingOps[0].sequenceNumber;
                            if (newEarliestSeq <= latestSeq) {
                                logger.sendTelemetryEvent({
                                    eventName:"DuplicateOutstandingOps",
                                    category: "generic",
                                    // eslint-disable-next-line max-len
                                    message: `newEarliestSeq <= latestSeq in decodeSummary: ${newEarliestSeq} <= ${latestSeq}`,
                                });
                                while (newOutstandingOps.length > 0
                                    && newOutstandingOps[0].sequenceNumber <= latestSeq) {
                                    newOutstandingOps.shift();
                                }
                            }
                        }
                        outstandingOps = outstandingOps.concat(newOutstandingOps);
                    }
                    return outstandingOps;
                },
            };
        }

        assert(!!outstandingOpsBlob, "Outstanding ops blob missing, but base summary tree exists");
        assert(newBaseSummary !== undefined, "Base summary tree missing, but outstanding ops blob exists");
        baseSummary = newBaseSummary;
        pathParts.push(baseSummaryTreeKey);
        opsBlobs.unshift(outstandingOpsBlob);
    }
}

/**
 * Summary tree which is a handle of the previous successfully acked summary
 * and a blob of the outstanding ops since that summary.
 */
interface IEncodedSummary extends ISummaryTreeWithStats {
    readonly additionalPath: EscapedPath;
}

export type EncodeSummaryParam = {
    fromSummary: true;
    summaryNode: SummaryNode;
} | {
    fromSummary: false;
    initialSummary: ISummaryTreeWithStats;
};

/**
 * Creates a summary tree which is a handle of the previous successfully acked summary
 * and a blob of the outstanding ops since that summary. If there is no acked summary yet,
 * it will create with the tree found in the initial attach op and the blob of outstanding ops.
 * @param summaryParam - information about last acked summary and paths to encode if from summary,
 * otherwise the initial summary from the attach op.
 * @param outstandingOps - outstanding ops since last acked summary
 */
export function encodeSummary(
    summaryParam: EncodeSummaryParam,
    outstandingOps: ISequencedDocumentMessage[],
): IEncodedSummary {
    let additionalPath = EscapedPath.create(baseSummaryTreeKey);

    const builder = new SummaryTreeBuilder();
    builder.addBlob(outstandingOpsBlobKey, JSON.stringify(outstandingOps));

    if (summaryParam.fromSummary) {
        // Create using handle of latest acked summary
        const summaryNode = summaryParam.summaryNode;
        if (summaryNode.additionalPath !== undefined) {
            additionalPath = additionalPath.concat(summaryNode.additionalPath);
        }
        builder.addHandle(baseSummaryTreeKey, SummaryType.Tree, summaryNode.fullPath.path);
    } else {
        // Create using initial summary from attach op
        builder.addWithStats(baseSummaryTreeKey, summaryParam.initialSummary);
    }

    const summary = builder.getSummaryTree();
    return {
        ...summary,
        additionalPath,
    };
}

/**
 * Information about the initial summary tree found from an attach op.
 */
export interface IInitialSummary {
    sequenceNumber: number;
    id: string;
    summary: ISummaryTreeWithStats | undefined;
}

/**
 * Represents the details needed to create a child summarizer node.
 */
export interface ICreateChildDetails {
    /** Summary from attach op if known */
    initialSummary: IInitialSummary | undefined;
    /** Latest summary from server node data */
    latestSummary: SummaryNode | undefined;
    /** Sequence number of latest known change to the node */
    changeSequenceNumber: number;
}
