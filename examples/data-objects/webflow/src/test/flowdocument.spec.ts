/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Marker, ReferenceType } from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeLoaderCompat } from "@fluidframework/test-version-utils";
import { FlowDocument } from "../document";
import { TagName } from "../util";

describeLoaderCompat("FlowDocument", (getTestObjectProvider) => {
    let doc: FlowDocument;

    let provider: ITestObjectProvider;
    beforeEach(async () => {
        provider = getTestObjectProvider();
        const container = await provider.createContainer(FlowDocument.getFactory());
        doc = await requestFluidObject<FlowDocument>(container, "default");
    });

    function expect(expected: string) {
        assert.strictEqual(doc.toString(), expected);
    }

    function expectTags(start: number, end = start + 1, ...expected: string[][]) {
        for (let i = start; i < end; i++) {
            const actual = doc.getTags(i).map((marker) => {
                assert.strictEqual(marker.refType, ReferenceType.NestBegin | ReferenceType.Tile);
                return marker.properties.tags as string[];
            });
            assert.deepStrictEqual(actual, expected);
        }
    }

    function verifyEnds(start: number, end: number) {
        const { segment: startSeg } = doc.getSegmentAndOffset(start);
        const { segment: endSeg } = doc.getSegmentAndOffset(end);

        assert.strictEqual(doc.getStart(endSeg as Marker), startSeg);
        assert.strictEqual(doc.getEnd(startSeg as Marker), endSeg);
    }

    function insertTags(tags: string[], start: number, end?: number) {
        doc.insertTags(tags as TagName[], start, end);
    }

    describe("tags", () => {
        describe("insertTags", () => {
            it("insert tag into empty", () => {
                insertTags(["t"], 0);
                expect("<t></t>");
                verifyEnds(0, 1);
                expectTags(0, 1, ["t"]);
                expectTags(1);
            });
            it("insert tag around text", () => {
                doc.insertText(0, "012");
                expectTags(0, doc.length);
                insertTags(["a", "b"], 1, 2);
                expect("0<a><b>1</b></a>2");
                verifyEnds(1, 3);
                expectTags(0);
                expectTags(1, 3, ["a", "b"]);
                expectTags(3, 4);
            });
        });
        describe("removeRange", () => {
            describe("removing start implicitly removes end", () => {
                it("'[<t>]</t>' -> ''", () => {
                    insertTags(["t"], 0, 0);
                    expect("<t></t>");

                    doc.remove(0, 1);
                    expect("");
                });
                it("'0[1<a><b>2]3</b></a>4' -> '034'", () => {
                    doc.insertText(0, "01234");
                    insertTags(["a", "b"], 2, 4);
                    expect("01<a><b>23</b></a>4");

                    doc.remove(1, 4);
                    expect("034");
                });
            });
            describe("preserving start implicitly preserves end", () => {
                it("'<t>[</t>]' -> '<t></t>'", () => {
                    insertTags(["t"], 0, 0);
                    expect("<t></t>");

                    doc.remove(1, 2);
                    expect("<t></t>");
                });
                it("'0<t>1[</t>]2' -> '0<t>1[</t>]2'", () => {
                    doc.insertText(0, "012");
                    insertTags(["t"], 1, 2);
                    expect("0<t>1</t>2");

                    doc.remove(3, 4);
                    expect("0<t>1</t>2");
                });
                it("'0<t>[1</t>]' -> '0<t></t>'", () => {
                    doc.insertText(0, "01");
                    insertTags(["t"], 1, 2);
                    expect("0<t>1</t>");

                    doc.remove(2, 4);
                    expect("0<t></t>");
                });
            });
        });
        describe("ReferencePosition after last position", () => {
            it("can create", () => {
                const localRef = doc.addLocalRef(doc.length);
                assert.strictEqual(doc.localRefToPosition(localRef), doc.length);
                doc.removeLocalRef(localRef);
            });
        });
    });
});
