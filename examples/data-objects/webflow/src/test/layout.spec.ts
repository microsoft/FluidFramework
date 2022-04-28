/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/unbound-method */

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
require("jsdom-global")("", { url: "http://localhost" });
window.performance.mark ??= (() => undefined as PerformanceMark);
window.performance.measure ??= (() => undefined as PerformanceMeasure);

import { strict as assert } from "assert";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeLoaderCompat } from "@fluidframework/test-version-utils";
import { htmlFormatter } from "..";
import { FlowDocument } from "../document";
import { Layout } from "../view/layout";

interface ISnapshotNode {
    node: Node;
    children: ISnapshotNode[];
}

const snapshot = (root: Node): ISnapshotNode => ({
    node: root,
    children: [...root.childNodes].map(snapshot),
});

function expectTree(actual: Node, expected: ISnapshotNode) {
    assert.strictEqual(actual, expected.node);

    const children = expected.children;
    let i = 0;
    for (let child = actual.firstChild; child; child = child.nextSibling, i++) {
        expectTree(child, children[i]);
    }
    assert.strictEqual(i, children.length);
}

describeLoaderCompat("Layout", (getTestObjectProvider) => {
    let doc: FlowDocument;
    let root: HTMLElement;
    let layout: Layout;

    let provider: ITestObjectProvider;
    before(async () => {
        provider = getTestObjectProvider(/* reset */ false);
        const container = await provider.createContainer(FlowDocument.getFactory());
        doc = await requestFluidObject<FlowDocument>(container, "default");
    });

    beforeEach(() => {
        doc.remove(0, doc.length);
        root = document.createElement("section");
    });

    afterEach(() => {
        layout.remove();
        layout = undefined;
        root = undefined;
    });

    const getHTML = () => root.innerHTML;

    describe("round-trip", () => {
        async function check() {
            await layout.rendered;
            const expectedHtml = getHTML();

            // Currently, we still regenerate <br> tags.
            // const expectedTree = snapshot(root);

            layout.sync();
            assert.strictEqual(getHTML(), expectedHtml);

            // Currently, we still regenerate <br> tags.
            // expectTree(root, expectedTree);
        }

        beforeEach(() => {
            layout = new Layout(doc, root, htmlFormatter);
        });

        afterEach(async () => {
            return check();
        });

        it("Single text segment", async () => {
            doc.insertText(0, "0");
            await check();
        });

        it("Split text segment", async () => {
            doc.insertText(0, "02");
            await check();
            doc.insertText(1, "1");
            await check();
        });

        it("Insert paragraph", async () => {
            console.log("blah");
            doc.insertText(0, "023");
            console.log("blah");
            // Force contiguous text segment to split into three segments.
            doc.annotate(1, 2, { zamboni: false });
            console.log("blah");
            await check();
            console.log("blah");
            doc.insertParagraph(1);
            await check();
        });

        it("Insert after new paragraph", async () => {
            doc.insertText(0, "0");
            await check();
            doc.insertParagraph(1);
            await check();
            // This test tends to detect leaked '<br>' tags.
            doc.insertText(2, "2");
            await check();
        });

        it("Add/remove 3 paragraphs with 1 char spans", async () => {
            for (const text of ["0", "2", "4"]) {
                doc.insertText(doc.length, text);
                await check();
                doc.insertParagraph(doc.length);
                await check();
            }
            while (doc.length > 0) {
                doc.remove(doc.length - 1, doc.length);
                await check();
            }
        });

        it("Remove paragraphs 2 with textspans of 2", async () => {
            doc.insertText(0, "013467");
            await check();
            doc.insertParagraph(2);
            await check();
            doc.insertParagraph(5);
            await check();
            doc.remove(5, 6);
            await check();
            doc.remove(2, 3);
            await check();
        });

        // it("Nested tag markers", async () => {
        //     doc.insertTags([Tag.h1], 0);
        //     await check();
        //     doc.insertTags([Tag.p], 1);
        //     await check();
        //     doc.insertText(1, "a");
        //     await check();
        //     doc.insertText(3, "b");
        //     await check();
        //     doc.setFormat(0, Tag.h2);
        //     await check();
        //     doc.setFormat(0, Tag.h3);
        //     await check();
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
                layout = new Layout(doc, root, htmlFormatter);
                doc.insertText(0, "0");
                expect("<p>0</p>");
            });
            it("Multiple segments: '012'", () => {
                layout = new Layout(doc, root, htmlFormatter);
                doc.insertText(0, "0");
                expect("<p>0</p>");
                doc.insertText(1, "1");
                expect("<p>01</p>");
                doc.insertText(2, "2");
                expect("<p>012</p>");
            });
            it("Adjacent text segments with same style are coalesced: '01'", () => {
                layout = new Layout(doc, root, htmlFormatter);
                doc.insertText(0, "0");
                doc.insertText(1, "1");
                expect("<p>01</p>");
            });
            describe("split", () => {
                it(`0(1)2`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "02");
                    expect("<p>02</p>");
                    doc.insertText(1, "1");
                    expect("<p>012</p>");
                });
                it(`0P1P2`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "02");
                    expect("<p>02</p>");
                    doc.insertText(1, "1");
                    expect("<p>012</p>");
                });
            });
            describe(`Emit spans as-needed for CSS`, () => {
                it(`'0[class="a"]1`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "01");
                    doc.addCssClass(0, 1, "a");
                    expect('<p><span class="a">0</span>1</p>');
                });
                it(`'01[class="a"]`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "01");
                    doc.addCssClass(1, 2, "a");
                    expect('<p>0<span class="a">1</span></p>');
                });
                it(`'0[class="a"]1[class="a"]`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "0");
                    doc.addCssClass(0, 1, "a");
                    doc.insertText(1, "1");
                    doc.addCssClass(1, 2, "a");
                    expect('<p><span class="a">01</span></p>');
                });
                it(`'0[class="a"]1[class="b"]`, () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "01");
                    doc.addCssClass(0, 1, "a");
                    doc.addCssClass(1, 2, "b");
                    expect('<p><span class="a">0</span><span class="b">1</span></p>');
                });
            });
            describe("Nodes for replaced segments are removed", () => {
                it("'(0)1'", () => {
                    layout = new Layout(doc, root, htmlFormatter);
                    doc.insertText(0, "0");
                    expect("<p>0</p>");
                    doc.replaceWithText(0, 1, "1");
                    expect("<p>1</p>");
                });
                it("'(0)(1)(2)3'", () => {
                    layout = new Layout(doc, root, htmlFormatter);
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
                layout = new Layout(doc, root, htmlFormatter);
                expect("<p></p>");
            });
            it("2 paragraphs", () => {
                layout = new Layout(doc, root, htmlFormatter);
                doc.insertParagraph(0);
                expect("<p></p><p></p>");
            });
            it("2 paragraphs: 0P1", () => {
                layout = new Layout(doc, root, htmlFormatter);
                doc.insertText(0, "01");
                doc.insertParagraph(1);
                expect("<p>0</p><p>1</p>");
            });
            it("3 paragraphs, inceremental", () => {
                layout = new Layout(doc, root, htmlFormatter);
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
