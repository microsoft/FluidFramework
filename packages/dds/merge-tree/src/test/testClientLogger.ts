/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IMergeTreeDeltaOpArgs, MergeTreeMaintenanceType } from "..";
import { UnassignedSequenceNumber } from "../constants";
import { IMergeTreeOp } from "../ops";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

function getOpString(msg: ISequencedDocumentMessage | undefined) {
    if(msg === undefined) {
        return "";
    }
    const op = msg.contents as IMergeTreeOp;
    const opType = op.type.toString();
    // eslint-disable-next-line @typescript-eslint/dot-notation, max-len
    const opPos = op && op["pos1"] !== undefined ? `@${op["pos1"]}${op["pos2"] !== undefined ? `,${op["pos2"]}` : ""}` : "";

    const seq = msg.sequenceNumber < 0 ? "L" : (msg.sequenceNumber - msg.minimumSequenceNumber).toString();
    const ref = (msg.referenceSequenceNumber - msg.minimumSequenceNumber).toString();
    const client = msg.clientId;
    return `${seq}:${ref}:${client}${opType}${opPos}`;
}

type ClientMap = Partial<Record<"A" | "B" | "C" | "D" | "E", TestClient>>;

export function createClientsAtInitialState<TClients extends ClientMap>(
    initialState: string,
    ... clientIds: (string & keyof TClients)[]
): Record<keyof TClients, TestClient> & {all: TestClient[]}
{
    const setup = (c: TestClient)=>{
        c.insertTextLocal(0, initialState);
        while(c.getText().includes("-")) {
            const index = c.getText().indexOf("-");
            c.removeRangeLocal(index, index + 1);
        }
    };
    const all: TestClient[] = [];
    const clients: Partial<Record<keyof TClients, TestClient>> = {};
    for(const id of clientIds) {
        if(clients[id] === undefined) {
            clients[id] = new TestClient();
            all.push(clients[id]);
            setup(clients[id]);
            clients[id].startOrUpdateCollaboration(id);
        }
    }

    return {...clients, all};
}
export class TestClientLogger {
    public static toString(clients: readonly TestClient[]) {
        return clients.map((c)=>this.getSegString(c)).reduce<[string,string]>((pv,cv)=>{
            pv[0] += `|${cv.acked.padEnd(cv.local.length,"")}`;
            pv[1] += `|${cv.local.padEnd(cv.acked.length,"")}`;
            return pv;
        },["",""]).join("\n");
    }

    private readonly incrementalLog = false;

    private readonly paddings: number[] = [];
    private readonly roundLogLines: string[][] = [];

    private ackedLine: string[];
    private localLine: string[];
    // initialize to private instance, so first real edit will create a new line
    private lastOp: any | undefined = {};

    constructor(
        private readonly clients: readonly TestClient[],
        private readonly title?: string,
    ) {
        const logHeaders = [];
        clients.forEach((c,i)=>{
            logHeaders.push("op");
            logHeaders.push(`client ${c.longClientId}`);
            const callback = (op: IMergeTreeDeltaOpArgs)=>{
                if(this.lastOp !== op.op) {
                    this.addNewLogLine();
                    this.lastOp = op.op;
                }
                const clientLogIndex = i * 2;

                this.ackedLine[clientLogIndex] = getOpString(op.sequencedMessage ?? c.makeOpMessage(op.op));
                const segStrings = TestClientLogger.getSegString(c);
                this.ackedLine[clientLogIndex + 1] = segStrings.acked;
                this.localLine[clientLogIndex + 1] = segStrings.local;

                this.paddings[clientLogIndex] =
                    Math.max(
                        this.ackedLine[clientLogIndex].length,
                        this.localLine[clientLogIndex].length,
                        this.paddings[clientLogIndex]);

                this.paddings[clientLogIndex + 1] =
                    Math.max(
                        this.ackedLine[clientLogIndex + 1].length,
                        this.localLine[clientLogIndex + 1].length,
                        this.paddings[clientLogIndex + 1]);
            };
            c.mergeTreeDeltaCallback = callback;
            c.mergeTreeMaintenanceCallback = (main,op) => {
                if(main.operation === MergeTreeMaintenanceType.ACKNOWLEDGED) {
                    callback(op);
                }
            };
        });
        this.roundLogLines.push(logHeaders);
        this.roundLogLines[0].forEach((v) => this.paddings.push(v.length));
        this.addNewLogLine(); // capture initial state
    }

    private addNewLogLine() {
        if(this.incrementalLog) {
            while(this.roundLogLines.length > 0) {
                const logLine = this.roundLogLines.shift();
                if(logLine.some((c)=>c.trim().length > 0)) {
                    console.log(logLine.map((v, i) => v.padEnd(this.paddings[i])).join(" | "));
                }
            }
        }
        this.ackedLine = [];
        this.localLine = [];
        this.clients.forEach((cc, clientLogIndex)=>{
            const segStrings = TestClientLogger.getSegString(cc);
            this.ackedLine.push("", segStrings.acked);
            this.localLine.push("", segStrings.local);

            this.paddings[clientLogIndex] =
                Math.max(
                    this.ackedLine[clientLogIndex].length,
                    this.localLine[clientLogIndex].length,
                    this.paddings[clientLogIndex]);

            this.paddings[clientLogIndex + 1] =
                Math.max(
                    this.ackedLine[clientLogIndex + 1].length,
                    this.localLine[clientLogIndex + 1].length,
                    this.paddings[clientLogIndex + 1]);
        });
        this.roundLogLines.push(this.ackedLine);
        this.roundLogLines.push(this.localLine);
    }

    public validate() {
        const baseText = this.clients[0].getText();
        this.clients.forEach(
            (c) => {
                if (c === this.clients[0]) { return; }
                // Pre-check to avoid this.toString() in the string template
                if (c.getText() !== baseText) {
                    assert.equal(
                        c.getText(),
                        baseText,
                        // eslint-disable-next-line max-len
                        `\n${this.toString()}\nClient ${c.longClientId} does not match client ${this.clients[0].longClientId}`);
                }
            });
        return baseText;
    }

    public toString(excludeHeader: boolean = false) {
        let str = "";
        if(!excludeHeader) {
            str +=
                `_: Local State\n`
                + `-: Deleted\n`
                + `*: Unacked Insert and Delete\n`
                + `${this.clients[0].getCollabWindow().minSeq}: msn/offset\n`
                + `Op format <seq>:<ref>:<client><type>@<pos1>,<pos2>\n`
                + `sequence number represented as offset from msn. L means local.\n`
                + `op types: 0) insert 1) remove 2) annotate\n`;

            if (this.title) {
                str += `${this.title}\n`;
            }
        }
        str += this.roundLogLines
            .filter((line) => line.some((c) => c.trim().length > 0))
            .map((line) => line.map((v, i) => v.padEnd(this.paddings[i])).join(" | "))
            .join("\n");
        return str;
    }

    private static getSegString(client: TestClient): { acked: string, local: string } {
        let acked: string = "";
        let local: string = "";
        const nodes = [...client.mergeTree.root.children];
        while (nodes.length > 0) {
            const node = nodes.shift();
            if (node) {
                if (node.isLeaf()) {
                    if (TextSegment.is(node)) {
                        if (node.removedSeq) {
                            if (node.removedSeq === UnassignedSequenceNumber) {
                                acked += "_".repeat(node.text.length);
                                if (node.seq === UnassignedSequenceNumber) {
                                    local += "*".repeat(node.text.length);
                                }
                                local += "-".repeat(node.text.length);
                            } else {
                                acked += "-".repeat(node.text.length);
                                local += " ".repeat(node.text.length);
                            }
                        } else {
                            if (node.seq === UnassignedSequenceNumber) {
                                acked += "_".repeat(node.text.length);
                                local += node.text;
                            } else {
                                acked += node.text;
                                local += " ".repeat(node.text.length);
                            }
                        }
                    }
                } else {
                    nodes.push(...node.children);
                }
            }
        }
        return { acked, local };
    }
}
