/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { UnassignedSequenceNumber } from "../constants";
import { IMergeTreeOp } from "../ops";
import { TextSegment } from "../textSegment";
import { TestClient } from "./testClient";

export class TestClientLogger {
    private readonly incrementalLog = false;

    private readonly paddings: number[] = [];
    private readonly roundLogLines: string[][] = [];

    constructor(
        private readonly clients: readonly TestClient[],
        private readonly title?: string) {
        this.roundLogLines.push([
            "seq",
            "op",
            ...this.clients.map((c) => `client ${c.longClientId}`),
        ]);

        this.roundLogLines[0].forEach((v) => this.paddings.push(v.length));
    }

    public log(msg?: ISequencedDocumentMessage, preAction?: (c: TestClient) => void) {
        const seq = msg ? msg.sequenceNumber.toString() : "";
        const client = msg ? msg.clientId : "";
        const op = msg ? msg.contents as IMergeTreeOp : undefined;
        const opType = op ? op.type.toString() : "";
        // eslint-disable-next-line @typescript-eslint/dot-notation, max-len
        const opPos = op && op["pos1"] !== undefined ? `@${op["pos1"]}${op["pos2"] !== undefined ? `,${op["pos2"]}` : ""}` : "";
        const clientOp = ` ${client}${opType}${opPos}`;
        const ackedLine: string[] = [
            seq,
            clientOp,
        ];
        this.roundLogLines.push(ackedLine);
        const localLine: string[] = ["", ""];
        let localChanges = false;
        this.paddings[0] = Math.max(ackedLine[0].length, this.paddings[0]);
        this.paddings[1] = Math.max(ackedLine[1].length, this.paddings[1]);
        this.clients.forEach((c, i) => {
            if (preAction) {
                try {
                    preAction(c);
                } catch (e) {
                    e.message += this.toString();
                    throw e;
                }
            }
            const segStrings = this.getSegString(c);
            ackedLine.push(segStrings.acked);
            localLine.push(segStrings.local);
            if (!localChanges && segStrings.local.trim().length > 0) {
                localChanges = true;
            }
            this.paddings[i + 2] = Math.max(ackedLine[i + 2].length, this.paddings[i + 2]);
        });
        if (localChanges) {
            this.roundLogLines.push(localLine);
        }
        if (this.incrementalLog) {
            console.log(ackedLine.map((v, i) => v.padEnd(this.paddings[i])).join(" | "));
        }
    }

    public validate() {
        const baseText = this.clients[0].getText();
        this.clients.forEach(
            (c) => {
                if (c === this.clients[0]) { return; }
                // Precheck to avoid this.toString() in the string template
                if (c.getText() !== baseText) {
                    assert.equal(
                        c.getText(),
                        baseText,
                        // eslint-disable-next-line max-len
                        `${this.toString()}\nClient ${c.longClientId} does not match client ${this.clients[0].longClientId}`);
                }
            });
        return baseText;
    }

    public toString() {
        let str = "";
        if (this.title) {
            str += `${this.title}\n`;
        }
        str += this.roundLogLines
            .map((line) => line.map((v, i) => v.padEnd(this.paddings[i])).join(" | "))
            .join("\n");
        return str;
    }

    private getSegString(client: TestClient): { acked: string, local: string } {
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
