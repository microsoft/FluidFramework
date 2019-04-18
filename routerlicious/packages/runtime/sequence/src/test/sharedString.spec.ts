import { ITree } from "@prague/container-definitions";
import { TextSegment } from "@prague/merge-tree";
import {
    MockStorage,
// tslint:disable-next-line:no-submodule-imports
} from "@prague/merge-tree/dist/test/";
import * as assert from "assert";
import { SharedString } from "../sharedString";
import * as mocks from "./mocks";

describe("SharedString", () => {

    const documentId = "fakeId";
    let runtime: mocks.MockRuntime;

    beforeEach(() => {
        runtime = new mocks.MockRuntime();
    });

    it("snapshots", async () => {
        const insertText = "text";
        const segmentCount = 1000;

        const sharedString = new SharedString(runtime, documentId);
        sharedString.client.mergeTree.collabWindow.collaborating = false;

        for (let i = 0; i < segmentCount; i = i + 1) {
            sharedString.client.insertSegmentLocal(0, new TextSegment(`${insertText}${i}`));
        }

        let tree = sharedString.snapshot();
        assert(tree.entries.length === 2);
        assert(tree.entries[0].path === "header");
        assert(tree.entries[1].path === "content");
        let subTree = tree.entries[1].value as ITree;
        assert(subTree.entries.length === 2);
        assert(subTree.entries[0].path === "header");
        assert(subTree.entries[1].path === "tardis");

        await CreateStringAndCompare(sharedString, tree);

        for (let i = 0; i < segmentCount; i = i + 1) {
            sharedString.client.insertSegmentLocal(0, new TextSegment(`${insertText}-${i}`));
        }

        tree = sharedString.snapshot();
        assert(tree.entries.length === 2);
        assert(tree.entries[0].path === "header");
        assert(tree.entries[1].path === "content");
        subTree = tree.entries[1].value as ITree;
        assert(subTree.entries.length === 3);
        assert(subTree.entries[0].path === "header");
        assert(subTree.entries[1].path === "body");
        assert(subTree.entries[2].path === "tardis");

        await CreateStringAndCompare(sharedString, tree);
    });

    async function CreateStringAndCompare(sharedString: SharedString, tree: ITree): Promise<void> {
        const services = {
            deltaConnection: new mocks.MockDeltaConnection(),
            objectStorage: new MockStorage(tree),
        };

        const sharedString2 = new SharedString(runtime, documentId, services);
        await sharedString2.load(0, null/*headerOrigin*/, services);

        assert(sharedString.getText() === sharedString2.getText());
    }
});
