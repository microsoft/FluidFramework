/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-var-requires
// tslint:disable:no-require-imports
require("jsdom-global")("", { url: "http://localhost" });
window.performance.mark = window.performance.mark || (() => {});
window.performance.measure = window.performance.measure || (() => {});

// tslint:enable:mocha-no-side-effect-code
// tslint:disable:binary-expression-operand-order
import { TestHost } from "@microsoft/fluid-local-test-utils";
import { strict as assert } from "assert";
// tslint:disable-next-line:no-import-side-effect
import "mocha";
import { FlowDocument, flowDocumentFactory } from "../src/document";
import { markdownFormatter } from "../src/markdown/formatters";
import { flowDocumentType } from "../src/runtime";
import { Layout } from "../src/view/layout";

// import * as debug from "debug";
// debug.enable("flow:*");

// tslint:disable:mocha-no-side-effect-code
const commonmark = processTests(require("./unit.json"));

function processTests(tests: { markdown: string, html: string, section: string }[]) {
    const result = new Map<string, { markdown: string, expected: string }[]>();

    for (const { markdown, html, section } of tests) {
        const item = { markdown, expected: html };
        let items = result.get(section);
        if (!items) {
            items = [item];
            result.set(section, items);
        } else {
            items.push(item);
        }
    }

    return result;
}

// interface ISnapshotNode {
//     node: Node;
//     children: ISnapshotNode[];
// }

// function snapshot(root: Node): ISnapshotNode {
//     return {
//         node: root,
//         children: [...root.childNodes].map(snapshot),
//     };
// }

// function expectTree(actual: Node, expected: ISnapshotNode) {
//     if (actual !== expected.node) {
//         assert.fail(actual, expected.node);
//     }

//     const children = expected.children;
//     let i = 0;
//     for (let child = actual.firstChild; child; child = child.nextSibling, i++) {
//         expectTree(child, children[i]);
//     }
//     assert.strictEqual(i, children.length);
// }

describe("Markdown", () => {
    let host: TestHost;
    let doc: FlowDocument;
    let root: HTMLElement;
    let layout: Layout;
    let rendered: Promise<void>;

    before(async () => {
        host = new TestHost([
            [flowDocumentType, Promise.resolve(flowDocumentFactory)],
        ]);

        doc = await host.createAndAttachComponent("fd", flowDocumentType);
    });

    after(async () => {
        await host.close();
    });

    beforeEach(() => {
        doc.remove(0, doc.length);
        root = document.createElement("section");

        layout = new Layout(doc, root, markdownFormatter);

        let renderResolver: () => void;
        layout.invalidatedCallback = () => {
            if (!renderResolver) {
                rendered = new Promise((accept) => {
                    console.log("Render pending");
                    renderResolver = accept;
                });
            }
        };
        layout.invalidatedCallback(NaN, NaN);
        layout.renderCallback = () => {
            if (renderResolver) {
                console.log("Render completed");
                renderResolver();
            }
            renderResolver = undefined;
        };
    });

    afterEach(async () => {
        await check(getHTML());
        layout.remove();
        layout = undefined;
        root = undefined;
    });

    async function check(expected: string) {
        await rendered;
        // const expectedTree = snapshot(root);

        // // Force a rerender and verify the same tree is produced.
        // layout.sync();
        assert.strictEqual(getHTML(), expected);
        // expectTree(root, expectedTree);
    }

    function getHTML() {
        return root.innerHTML;
    }

    function test({ markdown, expected }: { markdown: string, expected: string }) {
        it(JSON.stringify(markdown), async () => {
            doc.insertText(0, markdown);
            await check(expected);
        });
    }

    describe("commonmark", () => {
        // tslint:disable-next-line:mocha-no-side-effect-code
        for (const [section, tests] of commonmark.entries()) {
            describe(section, () => {
                // tslint:disable-next-line:mocha-no-side-effect-code
                tests.map(test);
            });
        }
    });
});
