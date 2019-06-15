import * as assert from "assert";
import { TextSegment } from "..";
import { createInsertSegmentOp, createRemoveRangeOp } from "../opBuilder";
import { TestClient } from "./testClient";

describe("MergeTree.markRangeRemoved", () => {
    let client: TestClient;
    beforeEach(() => {
        client = new TestClient();
        client.startCollaboration("local");
        for (const char of "hello world") {
            client.applyMsg(
                client.makeOpMessage(
                    client.insertTextLocal(client.getLength(), char),
                    client.getCurrentSeq() + 1));
        }
     });

    it("local remove followed by local insert", () => {
        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");

        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "text");
    });

    it("local insert followed by local remove", () => {
        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "texthello world");

        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");
    });

    it("remote remove followed by local insert", () => {

        client.applyMsg(
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq ,
                "remote"));

        assert.equal(client.getText(), "");

        client.insertTextLocal(0, "text");
        assert.equal(client.getText(), "text");
    });

    it("local remove followed by remote insert", () => {
        client.removeRangeLocal(0, client.getLength());
        assert.equal(client.getText(), "");

        client.applyMsg(
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq ,
                "remote"));

        assert.equal(client.getText(), "text");
    });

    it("remote remove followed by remote insert", () => {

        const removeMsg =
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 2,
                client.mergeTree.collabWindow.currentSeq,
                "remote2");

        const insertMsg =
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq ,
                "remote");

        client.applyMsg(removeMsg);
        client.applyMsg(insertMsg);

        assert.equal(client.getText(), "text");
    });

    it("remote insert followed by remote remove", () => {
        const insertMsg =
            client.makeOpMessage(
                createInsertSegmentOp(0, TextSegment.make("text")),
                client.mergeTree.collabWindow.currentSeq + 1,
                client.mergeTree.collabWindow.currentSeq ,
                "remote");

        const removeMsg =
            client.makeOpMessage(
                createRemoveRangeOp(0, client.getLength()),
                client.mergeTree.collabWindow.currentSeq + 2,
                client.mergeTree.collabWindow.currentSeq,
                "remote2");

        client.applyMsg(insertMsg);
        client.applyMsg(removeMsg);

        assert.equal(client.getText(), "text");
    });
});
