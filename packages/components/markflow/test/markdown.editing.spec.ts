/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-var-requires
// tslint:disable:no-require-imports
require("jsdom-global")("", { url: "http://localhost" });
window.performance.mark = window.performance.mark || (() => {});
window.performance.measure = window.performance.measure || (() => {});

// import * as debug from "debug";
// debug.enable("flow:*");
// tslint:enable:mocha-no-side-effect-code
// tslint:disable:binary-expression-operand-order
import { TestHost } from "@microsoft/fluid-local-test-server";
import { strict as assert } from "assert";
// tslint:disable-next-line:no-import-side-effect
import "mocha";
import { FlowDocument, flowDocumentFactory } from "../src/document";
import { Caret } from "../src/editor/caret";
import { markdownFormatter } from "../src/markdown/formatters";
import { flowDocumentType } from "../src/runtime";
import { noop } from "../src/util";
import { Layout } from "../src/view/layout";

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
    let caret: Caret;
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
        const caret = new Caret(layout);

        let renderResolver: () => void;
        const oldInvalidatedCallback = layout.invalidatedCallback || noop;
        layout.invalidatedCallback = (start, end) => {
            oldInvalidatedCallback(start, end);
            if (!renderResolver) {
                rendered = new Promise((accept) => {
                    console.log("Render pending");
                    renderResolver = accept;
                });
            }
        };
        layout.invalidatedCallback(NaN, NaN);

        const oldRenderCallback = layout.renderCallback || noop;
        layout.renderCallback = (start, end) => {
            oldRenderCallback(start, end);
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

    function sendKey() {
        const position = caret.position;
        const { segment, offset } = doc.getSegmentAndOffset(position);
        const { state, cursor } = layout.getCheckpoint(segment);
    }

    describe("editing", () => {
        it(`insert paragraph`, () => {
            doc.insertText(0, "ab");
        });
    });
});
