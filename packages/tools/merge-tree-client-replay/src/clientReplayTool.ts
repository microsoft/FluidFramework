/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import fs from "fs";
import { FileDeltaStorageService } from "@fluidframework/file-driver";
import {
    createGroupOp,
    IJSONSegment,
    IMergeTreeOp,
    ISegment,
    MergeTreeDeltaType,
} from "@fluidframework/merge-tree";
// eslint-disable-next-line import/no-internal-modules
import { TestClient } from "@fluidframework/merge-tree/dist/test/testClient";
import {
    IBlob,
    IChunkedOp,
    ISequencedDocumentMessage,
    ITree,
    ITreeEntry,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { IAttachMessage } from "@fluidframework/runtime-definitions";
import {
    SharedNumberSequenceFactory,
    SharedObjectSequenceFactory,
    SharedStringFactory,
    SparseMatrixFactory,
} from "@fluidframework/sequence";
import { ReplayArgs } from "./replayArgs";

// eslint-disable-next-line max-len
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, import/no-internal-modules
const cloneDeep = require("lodash/cloneDeep");

interface IFullPathTreeEntry extends ITreeEntry {
    fullPath?: string;
}

interface IFullPathSequencedDocumentMessage extends ISequencedDocumentMessage {
    fullPath?: string;
}

interface IMessageContents {
    address: string;
    contents: any;
    content: any;
    type: string;
}

/**
 * All the logic of replay tool
 */
export class ClientReplayTool {
    private errorCount = 0;
    private deltaStorageService: FileDeltaStorageService;
    public constructor(private readonly args: ReplayArgs) { }

    public async Go(): Promise<boolean> {
        this.args.checkArgs();

        // Make unhandled exceptions errors, not just warnings
        // Also report few of them!
        const listener = (up) => {
            this.reportError("UnhandledRejectionPromise", up);
        };
        process.on("unhandledRejection", listener);

        await this.setup();

        await this.mainCycle();

        process.removeListener("unhandledRejection", listener);

        return this.errorCount === 0;
    }

    private shouldReportError() {
        // Report only first 5 errors
        this.errorCount++;
        const errorsToReport = 5;
        if (this.errorCount <= errorsToReport) {
            return true;
        }
        if (this.errorCount === errorsToReport + 1) {
            console.error("\n!!! Too many errors - stopped reporting errors !!!");
        }
        return false;
    }

    private reportError(description: string, error?: any) {
        if (this.shouldReportError()) {
            if (error === undefined) {
                console.error(description);
            } else if (error instanceof Error) {
                console.error(`${description}\n${error.stack}`);
            } else {
                console.error(`${description} ${error}`);
            }
        }
    }

    private async setup() {
        if (this.args.inDirName === undefined) {
            return Promise.reject("Please provide --indir argument");
        }
        if (!fs.existsSync(this.args.inDirName)) {
            return Promise.reject("File does not exist");
        }

        this.deltaStorageService = new FileDeltaStorageService(this.args.inDirName);
    }

    private async mainCycle() {
        const clients = new Map<string, Map<string, TestClient>>();
        const mergeTreeAttachTrees = new Map<string, { tree: ITree, specToSeg(segment: IJSONSegment): ISegment }>();
        const mergeTreeMessages = new Array<IFullPathSequencedDocumentMessage>();
        const chunkMap = new Map<string, string[]>();
        for (const message of this.deltaStorageService.getFromWebSocket(0, this.args.to)) {
            if (message.type === MessageType.ChunkedOp) {
                const chunk = JSON.parse(message.contents as string) as IChunkedOp;
                if (!chunkMap.has(message.clientId)) {
                    chunkMap.set(message.clientId, new Array<string>(chunk.totalChunks));
                }
                const chunks = chunkMap.get(message.clientId);
                const chunkIndex = chunk.chunkId - 1;
                if (chunks[chunkIndex] !== undefined) {
                    throw new Error("Chunk already assigned");
                }
                chunks[chunkIndex] = chunk.contents;
                if (chunk.chunkId === chunk.totalChunks) {
                    for (const c of chunks) {
                        if (c === undefined) {
                            throw new Error("Chunk not assigned");
                        }
                    }
                    message.contents = chunks.join("");
                    message.type = chunk.originalType;
                    chunkMap.delete(message.clientId);
                } else {
                    continue;
                }
            }

            const messagePathParts: string[] = [];
            switch (message.type as MessageType) {
                case MessageType.Operation:
                    let contents = message.contents as Partial<IMessageContents>;
                    if (contents) {
                        do {
                            if (typeof contents === "string") {
                                contents = JSON.parse(contents) as IMessageContents;
                            }
                            messagePathParts.push(contents.address);
                            contents = contents.contents as IMessageContents;
                        } while (contents.contents);

                        if (contents.type && contents.type === "attach") {
                            const legacyAttachMessage = contents.content as IAttachMessage;
                            legacyAttachMessage.id = [...messagePathParts, legacyAttachMessage.id].join("/");
                            this.processAttachMessage(legacyAttachMessage, mergeTreeAttachTrees);
                        } else {
                            const content = contents.content as IMessageContents;
                            const messagePath = [...messagePathParts, content.address].join("/");
                            if (content && mergeTreeAttachTrees.has(messagePath)) {
                                if (!clients.has(message.clientId)) {
                                    clients.set(message.clientId, new Map<string, TestClient>());
                                }
                                // TODO: Interval collections, store in map "key"
                                if (!content.contents.key) {
                                    const op = content.contents as IMergeTreeOp;
                                    if (this.args.verbose) {
                                        console.log(`MergeTree op ${messagePath}:\n ${JSON.stringify(op)}`);
                                    }
                                    const newMessage: IFullPathSequencedDocumentMessage = message;
                                    newMessage.fullPath = messagePath;
                                    newMessage.contents = op;
                                    mergeTreeMessages.push(newMessage);
                                    break;
                                }
                            }
                        }
                    }
                    break;

                case MessageType.Attach:
                    this.processAttachMessage(
                        message.contents as IAttachMessage,
                        mergeTreeAttachTrees);
                    break;
                default:
            }
        }
        if (mergeTreeAttachTrees.size > 0) {
            clients.set("readonly", new Map<string, TestClient>());
            for (const clientId of clients.keys()) {
                const client = clients.get(clientId);
                for (const mergeTreeId of mergeTreeAttachTrees.keys()) {
                    const creationInfo = mergeTreeAttachTrees.get(mergeTreeId);
                    client.set(
                        mergeTreeId,
                        // eslint-disable-next-line @typescript-eslint/unbound-method
                        await TestClient.createFromSnapshot(creationInfo.tree, clientId, creationInfo.specToSeg));
                }
                const pendingMessages = new Array<IFullPathSequencedDocumentMessage>();
                const reconnectClients =
                    new Array<{ client: Map<string, TestClient>, messages: IFullPathSequencedDocumentMessage[] }>();
                reconnectClients.push({ client, messages: mergeTreeMessages });
                for (const message of mergeTreeMessages) {
                    if (message.clientId !== clientId) {
                        pendingMessages.push(message);
                    } else {
                        // We found an op from this client
                        // that means we know this clients reference sequence number
                        // when the op was created, so apply all ops up to this ops
                        // reference sequence number before we apply this op
                        if (this.args.testReconnet) {
                            const reconnectPaths = new Set<string>();
                            const reconnectMessages: IFullPathSequencedDocumentMessage[] = [];
                            while (pendingMessages.length > 0
                                && pendingMessages[0].clientId === clientId
                                && pendingMessages[0].sequenceNumber <= message.referenceSequenceNumber) {
                                const reconnectMessage =
                                    cloneDeep(pendingMessages.shift()) as IFullPathSequencedDocumentMessage;
                                if (!reconnectPaths.has(reconnectMessage.fullPath)) {
                                    const reconnectClient = client.get(reconnectMessage.fullPath);
                                    const ops: IMergeTreeOp[] = [];
                                    while (reconnectClient.peekPendingSegmentGroups() !== undefined) {
                                        ops.push(reconnectClient.resetPendingSegmentsToOp(
                                            reconnectClient.peekPendingSegmentGroups()));
                                    }
                                    // we can't rewrite the op stream, so need to fit all the ops in one op
                                    // so coalese into a single group op;
                                    const reconnectOp = createGroupOp(... ops.reduce<IMergeTreeOp[]>((pv,cv)=> {
                                        if (cv.type === MergeTreeDeltaType.GROUP) {
                                            pv.push(... cv.ops);
                                        } else {
                                            pv.push(cv);
                                        }
                                        return pv;
                                    },[]));
                                    reconnectMessage.contents = reconnectOp;
                                    reconnectMessages.push(reconnectMessage);
                                    reconnectPaths.add(reconnectMessage.fullPath);
                                } else {
                                    reconnectMessage.contents = createGroupOp();
                                    reconnectMessages.push(reconnectMessage);
                                }
                            }
                            pendingMessages.unshift(...reconnectMessages);
                        }
                        while (pendingMessages.length > 0
                            && pendingMessages[0].sequenceNumber <= message.referenceSequenceNumber) {
                            const pendingMessage = pendingMessages.shift();
                            try {
                                client.get(pendingMessage.fullPath).applyMsg(pendingMessage);
                            } catch (error) {
                                console.log(JSON.stringify(pendingMessage, undefined, 2));
                                throw error;
                            }
                        }
                        const op = message.contents as IMergeTreeOp;
                        // Wrap in a group op, as that's the only way to
                        // apply an op locally
                        const testClient = client.get(message.fullPath);
                        try {
                            testClient.localTransaction(
                                op.type === MergeTreeDeltaType.GROUP ? op : createGroupOp(op));
                        } catch (error) {
                            console.log(JSON.stringify(message, undefined, 2));
                            throw error;
                        }
                        pendingMessages.push(message);
                    }
                }
                // No more ops from this client, so apply whatever is left
                for (const message of pendingMessages) {
                    const testClient = client.get(message.fullPath);
                    try {
                        testClient.applyMsg(message);
                    } catch (error) {
                        console.log(JSON.stringify(message, undefined, 2));
                        throw error;
                    }
                }
            }
            const readonlyClient = clients.get("readonly");
            for (const client of clients) {
                for (const mergeTree of client[1]) {
                    assert.equal(
                        mergeTree[1].getLength(),
                        readonlyClient.get(mergeTree[0]).getLength());
                    assert.equal(
                        mergeTree[1].getText(),
                        readonlyClient.get(mergeTree[0]).getText());
                }
            }
        }
    }

    private processAttachMessage(
        attachMessage: IAttachMessage,
        mergeTreeAttachTrees: Map<string, { tree: ITree, specToSeg(segment: IJSONSegment): ISegment }>) {
        const ddsTrees = this.getDssTreesFromAttach(attachMessage);
        const mergeTreeTypes = [
            {
                type: SharedStringFactory.Type,
                specToSeg: SharedStringFactory.segmentFromSpec,
            },
            {
                type: SparseMatrixFactory.Type,
                specToSeg: SparseMatrixFactory.segmentFromSpec,
            },
            {
                type: SharedObjectSequenceFactory.Type,
                specToSeg: SharedObjectSequenceFactory.segmentFromSpec,
            },
            {
                type: SharedNumberSequenceFactory.Type,
                specToSeg: SharedNumberSequenceFactory.segmentFromSpec,
            },
        ];
        for (const mergeTreeType of mergeTreeTypes) {
            if (ddsTrees.has(mergeTreeType.type)) {
                const trees = ddsTrees.get(mergeTreeType.type);
                for (const ssTree of trees) {
                    const tree = (ssTree.value as ITree);
                    let contentTree: ITreeEntry;
                    while (tree.entries.length > 0) {
                        contentTree = tree.entries.shift();
                        if (contentTree.path === "content") {
                            break;
                        }
                    }
                    // eslint-disable-next-line max-len
                    console.log(`MergeTree Found:\n ${JSON.stringify({ fullPath: ssTree.fullPath, type: mergeTreeType.type })}`);
                    mergeTreeAttachTrees.set(
                        ssTree.fullPath,
                        {
                            tree: contentTree.value as ITree,
                            specToSeg: mergeTreeType.specToSeg,
                        });
                }
            }
        }
    }

    private getDssTreesFromAttach(attachMessage: IAttachMessage) {
        const ddsTrees = new Map<string, IFullPathTreeEntry[]>();
        if (attachMessage.snapshot) {
            const snapshotTreeEntry: IFullPathTreeEntry = {
                value: attachMessage.snapshot,
                type: attachMessage.type,
                fullPath: attachMessage.id,
                path: undefined,
                mode: undefined,
            };
            ddsTrees.set(attachMessage.type, [snapshotTreeEntry]);
            const trees: IFullPathTreeEntry[] = [snapshotTreeEntry];
            while (trees.length > 0) {
                const tree = trees.shift();
                const treeEntries = (tree.value as ITree).entries;
                if (treeEntries) {
                    for (const entry of treeEntries) {
                        switch (entry.type) {
                            case "Tree":
                                const fullPathEntry: IFullPathTreeEntry = entry;
                                fullPathEntry.fullPath = `${tree.fullPath}/${entry.path}`;
                                trees.push(fullPathEntry);
                                break;
                            case "Blob":
                                if (entry.path === ".attributes") {
                                    const blob = entry.value as IBlob;
                                    const contents = JSON.parse(blob.contents) as { type: string };
                                    if (contents && contents.type) {
                                        if (!ddsTrees.has(contents.type)) {
                                            ddsTrees.set(contents.type, [tree]);
                                        } else {
                                            ddsTrees.get(contents.type).push(tree);
                                        }
                                    }
                                }
                            default:
                        }
                    }
                }
            }
        }
        return ddsTrees;
    }
}
