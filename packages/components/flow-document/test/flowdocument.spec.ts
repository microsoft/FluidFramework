// tslint:disable:binary-expression-operand-order
import { Component } from "@prague/app-component";
import { TestHost } from "@prague/local-test-server";
import { Marker, TextSegment } from "@prague/merge-tree";
import * as assert from "assert";
import { DocSegmentKind, FlowDocument, getDocSegmentKind } from "../src";

// tslint:disable-next-line:no-import-side-effect
import "mocha";

describe("FlowDocument", () => {
    let host: TestHost;
    let doc: FlowDocument;

    before(async () => {
        host = new TestHost([
            [FlowDocument.type, Promise.resolve(Component.createComponentFactory(FlowDocument))],
        ]);

        doc = await host.createAndOpenComponent("fd", FlowDocument.type);
    });

    after(async () => {
        await host.close();
    });

    beforeEach(() => {
        doc.remove(0, doc.length);
    });

    function stringify() {
        const s: string[] = [];
        doc.visitRange((position, segment) => {
            const kind = getDocSegmentKind(segment);
            switch (kind) {
                case DocSegmentKind.text:
                    s.push((segment as TextSegment).text);
                    break;
                case DocSegmentKind.beginTag:
                    s.push(`<${segment.properties.tag}>`);
                    break;
                case DocSegmentKind.endRange:
                    s.push(`</${segment.properties.tag}>`);
                    break;
                default:
                    s.push(kind);
            }
            return true;
        });
        return s.join("");
    }

    function expect(expected: string) {
        assert.strictEqual(stringify(), expected);
    }

    function verifyEnds(start: number, end: number) {
        const { segment: startSeg } = doc.getSegmentAndOffset(start);
        const { segment: endSeg } = doc.getSegmentAndOffset(end);

        assert.strictEqual(doc.getStart(endSeg as Marker), startSeg);
        assert.strictEqual(doc.getEnd(startSeg as Marker), endSeg);
    }

    describe("tags", () => {
        describe("insertTag", () => {
            it("insert tag into empty", () => {
                doc.insertTags(["t"], 0, 0);
                expect("<t></t>");
                verifyEnds(0, 1);
            });
            it("insert tag around text", () => {
                doc.insertText(0, "012");
                doc.insertTags(["t"], 1, 2);
                expect("0<t>1</t>2");
                verifyEnds(1, 3);
            });
        });
        describe("removeRange", () => {
            describe("removing start implicitly removes end", () => {
                it("'[<t>]</t>' -> ''", () => {
                    doc.insertTags(["t"], 0, 0);
                    expect("<t></t>");

                    doc.remove(0, 1);
                    expect("");
                });
                it("'0[1<a><b>2]3</b></a>4' -> '034'", () => {
                    doc.insertText(0, "01234");
                    doc.insertTags(["a", "b"], 2, 4);
                    expect("01<a><b>23</b></a>4");

                    doc.remove(1, 5);
                    expect("034");
                });
            });
            describe("preserving start implicitly preserves end", () => {
                it("'<t>[</t>]' -> '<t></t>'", () => {
                    doc.insertTags(["t"], 0, 0);
                    expect("<t></t>");

                    doc.remove(1, 2);
                    expect("<t></t>");
                });
                it("'0<t>1[</t>]2' -> '0<t>1[</t>]2'", () => {
                    doc.insertText(0, "012");
                    doc.insertTags(["t"], 1, 2);
                    expect("0<t>1</t>2");

                    doc.remove(3, 4);
                    expect("0<t>1</t>2");
                });
                it("'0<t>[1</t>]' -> '0<t></t>'", () => {
                    doc.insertText(0, "01");
                    doc.insertTags(["t"], 1, 2);
                    expect("0<t>1</t>");

                    doc.remove(2, 4);
                    expect("0<t></t>");
                });
            });
        });
        describe("LocalReference after last position", () => {
            it("can create", () => {
                const localRef = doc.addLocalRef(doc.length);
                assert.strictEqual(doc.localRefToPosition(localRef), doc.length);
                doc.removeLocalRef(localRef);
            });
        });
    });
});
