
import { createInsertSegmentOp, createRemoveRangeOp, PropertySet } from "@prague/merge-tree";
// tslint:disable-next-line: no-submodule-imports
import { TestClient } from "@prague/merge-tree/dist/test";
import {SubSequence } from "../sharedSequence";

const clientNames = ["Ed", "Ted", "Ned", "Harv", "Marv", "Glenda", "Susan"];
const verbose = true;

class SubSequeceTestClient extends TestClient {
    constructor() {
        super("",
            undefined,
            (spec) =>  SubSequence.fromJSONObject(spec));
    }

    public insertItemsRemote<T>(
        pos: number,
        items: T[],
        props: PropertySet,
        seq: number,
        refSeq: number,
        clientId: number,
    ) {
        const segment = new SubSequence(items);
        if (props) {
            segment.addProperties(props);
        }
        this.applyMsg(
            this.makeOpMessage(
                createInsertSegmentOp(pos, segment),
                seq,
                refSeq,
                clientId));
    }

    public relItems(clientId: number, refSeq: number) {
        let items: string = "";

        this.walkSegments(
            0,
            this.getLength(),
            (s) => {
                if (s instanceof SubSequence) {
                    items += s.items.toString();
                }
            });

        return `cli: ${this.getLongClientId(clientId)} refSeq: ${refSeq}: ${items}`;
    }
}

describe("SubSequece", () => {
    it("firstItemTest", () => {
        const cli = new SubSequeceTestClient();
        cli.startCollaboration("Fred1");
        for (const cname of clientNames) {
            cli.addLongClientId(cname);
        }
        cli.insertItemsRemote(0, [2, 11], undefined, 1, 0, 1);

        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        cli.insertItemsRemote(0, [4, 5, 6], undefined, 2, 0, 2);
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        const segment = new SubSequence<number>([3, 4, 1, 1]);
        const insert = cli.insertSegmentLocal(4, segment);
        if (verbose) {
            console.log(cli.mergeTree.toString());
        }
        if (verbose) {
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 3; j++) {
                    console.log(cli.relItems(i, j));
                }
            }
        }
        cli.applyMsg(cli.makeOpMessage(insert));
        cli.insertItemsRemote(6, [1, 5, 6, 2, 3], undefined, 4, 2, 2);
        cli.insertItemsRemote(0, [9], undefined, 5, 0, 2);
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 6; refSeq++) {
                    console.log(cli.relItems(clientId, refSeq));
                }
            }
        }
        cli.applyMsg(cli.makeOpMessage(
            createRemoveRangeOp(3, 6),
            6,
            5,
            3));
        cli.updateMinSeq(6);
        if (verbose) {
            console.log(cli.mergeTree.toString());
            for (let clientId = 0; clientId < 4; clientId++) {
                for (let refSeq = 0; refSeq < 7; refSeq++) {
                    console.log(cli.relItems(clientId, refSeq));
                }
            }
        }
    });
});
