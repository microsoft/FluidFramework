// tslint:disable:binary-expression-operand-order
import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { TestHost } from "@prague/local-test-server";
import * as assert from "assert";

import { SegmentSpan } from "../src/components/document/segmentspan";

// tslint:disable-next-line:no-import-side-effect
import { TextSegment } from "@prague/merge-tree";
import "mocha";

describe("SegmentSpan", () => {
    let host: TestHost;
    let doc: FlowDocument;

    before(async () => {
        host = new TestHost([
            [FlowDocument.type, Promise.resolve(Component.createComponentFactory(FlowDocument))],
        ]);

        doc = await host.createComponent("fd", FlowDocument.type);
    });

    after(async () => {
        await host.close();
    });

    function setup(chunks: string[]) {
        // Remove all content from the previous test (also removes EOF marker).
        doc.remove(0, doc.length);

        // Insert chunks as individual TextSegments into the document.
        for (const chunk of chunks) {
            doc.insertText(doc.length, chunk);
        }
    }

    function test(chunks: string[], start: number, end: number) {
        const expected = chunks.join("").slice(start, end);

        it(`${JSON.stringify(chunks)}: [${start}..${end}) -> ${JSON.stringify(expected)}`, () => {
            setup(chunks);

            // Build a segment span from the given [start..end) range.
            const span = new SegmentSpan();
            doc.visitRange((position, segment, startOffset, endOffset) => {
                span.append(position, segment, startOffset, endOffset);
                return true;
            }, start, end);

            // Verify that the SegmentSpan's computed [start..end) positions match the original range.
            assert.strictEqual(span.startPosition, start);
            assert.strictEqual(span.endPosition, end);

            // Verify that iterating over the span produces the expected string.
            let actual = "";
            span.forEach((position, segment, startOffset, endOffset) => {
                assert.strictEqual(position, doc.getPosition(segment));
                actual += (segment as TextSegment).text.slice(startOffset, endOffset);
                return true;
            });

            assert.strictEqual(actual, expected);
        });
    }

    // tslint:disable:mocha-no-side-effect-code
    test(["0"], 0, 1);
    test(["01"], 0, 1);
    test(["01"], 1, 2);
    test(["012"], 1, 2);
    test(["01", "23"], 1, 3);
    test(["01", "23", "45"], 1, 5);

    it(`Not first segment`, () => {
        setup(["01", "23"]);
        doc.visitRange((position, segment, startOffset, endOffset) => {
            const span = new SegmentSpan();
            span.append(position, segment, startOffset, endOffset);
            switch (position) {
                case 0:
                    assert.strictEqual(span.startPosition, 0);
                    assert.strictEqual(span.endPosition, 2);
                    break;
                default:
                    assert.strictEqual(span.startPosition, 2);
                    assert.strictEqual(span.endPosition, 4);
            }
            return true;
        }, 0, 4);
    });
});
