/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-var-requires
// tslint:disable:no-require-imports
require("jsdom-global")("", { url: "http://localhost" });
window.performance.mark = window.performance.mark || (() => {});
window.performance.measure = window.performance.measure || (() => {});

// tslint:disable-next-line:no-import-side-effect
import "mocha";

// tslint:disable:binary-expression-operand-order
import { TestHost } from "@prague/local-test-server";
import * as assert from "assert";
import { FlowDocument, flowDocumentFactory } from "../src/document";
import { Layout } from "../src/editor";

interface ISnapshotNode {
    node: Node;
    children: ISnapshotNode[];
}

function snapshot(root: Node): ISnapshotNode {
    return {
        node: root,
        children: [...root.childNodes].map(snapshot),
    };
}

function expectTree(actual: Node, expected: ISnapshotNode) {
    assert.strictEqual(actual, expected.node);

    const children = expected.children;
    let i = 0;
    for (let child = actual.firstChild; child; child = child.nextSibling, i++) {
        expectTree(child, children[i]);
    }
    assert.strictEqual(i, children.length);
}

// tslint:disable:max-func-body-length
describe("Layout", () => {
    let host: TestHost;
    let doc: FlowDocument;
    let root: HTMLElement;
    let layout: Layout;

    before(async () => {
        host = new TestHost([
            [FlowDocument.type, Promise.resolve(flowDocumentFactory)],
        ]);

        doc = await host.createAndAttachComponent("fd", FlowDocument.type);
        root = document.createElement("span");
    });

    after(async () => {
        await host.close();
    });

    beforeEach(() => {
        doc.remove(0, doc.length);
        layout = undefined;
        while (root.firstChild) {
            root.firstChild.remove();
        }
    });

    function getHTML() {
        return root.innerHTML;
    }

    describe("round-trip", () => {
        beforeEach(() => {
            layout = new Layout(doc, root);
        });

        afterEach(() => {
            const expectedHtml = getHTML();
            const expectedTree = snapshot(root);
            layout.sync();
            assert.strictEqual(getHTML(), expectedHtml);
            expectTree(root, expectedTree);
        });

        it("Single text segment", () => {
            doc.insertText(0, "0");
        });

        it("Split text segment", () => {
            doc.insertText(0, "02");
            doc.insertText(1, "1");
        });

        // it("Single paragraph", () => {
        //     doc.insertParagraph(0);
        // });

        // '<br>' tag is recreated?
        // it("Insert paragraph", () => {
        //     doc.insertText(0, "02");
        //     doc.insertParagraph(1);
        // });
    });

    describe.skip("structure", () => {
        function expect(expected: string, start = 0, end = doc.length) {
            layout.sync(start, end);
            const html = getHTML();
            console.log(html);
            assert.strictEqual(html, expected);

            const s = snapshot(root);
            layout.sync(start, end);
            assert.strictEqual(getHTML(), expected);
            expectTree(root, s);
        }

        describe("Text", () => {
            it("Single segment: '0'", () => {
                layout = new Layout(doc, root);
                doc.insertText(0, "0");
                expect("<p>0</p>");
            });
            it("Multiple segments: '012'", () => {
                layout = new Layout(doc, root);
                doc.insertText(0, "0");
                expect("<p>0</p>");
                doc.insertText(1, "1");
                expect("<p>01</p>");
                doc.insertText(2, "2");
                expect("<p>012</p>");
            });
            it("Adjacent text segments with same style are coalesced: '01'", () => {
                layout = new Layout(doc, root);
                doc.insertText(0, "0");
                doc.insertText(1, "1");
                expect("<p>01</p>");
            });
            describe("split", () => {
                it(`0(1)2`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "02");
                    expect("<p>02</p>");
                    doc.insertText(1, "1");
                    expect("<p>012</p>");
                });
                it(`0P1P2`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "02");
                    expect("<p>02</p>");
                    doc.insertText(1, "1");
                    expect("<p>012</p>");
                });
            });
            describe(`Emit spans as-needed for CSS`, () => {
                it(`'0[class="a"]1`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "01");
                    doc.addCssClass(0, 1, "a");
                    expect('<p><span class="a">0</span>1</p>');
                });
                it(`'01[class="a"]`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "01");
                    doc.addCssClass(1, 2, "a");
                    expect('<p>0<span class="a">1</span></p>');
                });
                it(`'0[class="a"]1[class="a"]`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "0");
                    doc.addCssClass(0, 1, "a");
                    doc.insertText(1, "1");
                    doc.addCssClass(1, 2, "a");
                    expect('<p><span class="a">01</span></p>');
                });
                it(`'0[class="a"]1[class="b"]`, () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "01");
                    doc.addCssClass(0, 1, "a");
                    doc.addCssClass(1, 2, "b");
                    expect('<p><span class="a">0</span><span class="b">1</span></p>');
                });
            });
            describe("Nodes for replaced segments are removed", () => {
                it("'(0)1'", () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "0");
                    expect("<p>0</p>");
                    doc.replaceWithText(0, 1, "1");
                    expect("<p>1</p>");
                });
                it("'(0)(1)(2)3'", () => {
                    layout = new Layout(doc, root);
                    doc.insertText(0, "0");
                    doc.insertText(1, "1");
                    doc.insertText(2, "2");
                    expect("<p>012</p>");
                    doc.replaceWithText(0, 3, "3");
                    expect("<p>3</p>");
                });
            });
        });

        describe("Paragraph", () => {
            it("1 paragraph", () => {
                layout = new Layout(doc, root);
                expect("<p></p>");
            });
            it("2 paragraphs", () => {
                layout = new Layout(doc, root);
                doc.insertParagraph(0);
                expect("<p></p><p></p>");
            });
            it("2 paragraphs: 0P1", () => {
                layout = new Layout(doc, root);
                doc.insertText(0, "01");
                doc.insertParagraph(1);
                expect("<p>0</p><p>1</p>");
            });
            it("3 paragraphs, inceremental", () => {
                layout = new Layout(doc, root);
                doc.insertText(0, "024");
                doc.insertParagraph(1);
                doc.insertParagraph(3);
                expect("<p>0</p>", 0, 1);
                expect("<p>0</p><p></p>", 1, 2);
                expect("<p>0</p><p>2</p>", 2, 3);
                expect("<p>0</p><p>2</p><p></p>", 3, 4);
                expect("<p>0</p><p>2</p><p>4</p>", 4, 5);
            });
        });
    });
});
