/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextSegment } from "@microsoft/fluid-merge-tree";
// tslint:disable:binary-expression-operand-order
import { TestHost } from "@microsoft/fluid-local-test-utils";
import * as assert from "assert";
// tslint:disable-next-line:no-import-side-effect
import "mocha";
import { FlowDocument, flowDocumentFactory, SegmentSpan } from "../src/document";
import { FlowDocumentType } from "../src/runtime";

describe("SegmentSpan", () => {
    let host: TestHost;
    let doc: FlowDocument;

    before(async () => {
        host = new TestHost([
            [FlowDocumentType, Promise.resolve(flowDocumentFactory)],
        ]);

        doc = await host.createAndAttachComponent("fd", FlowDocumentType);
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

            // Trivial 'spanOffsetToSegmentOffset()' case.  There is a one-off test of a more interesting case below.
            assert.deepStrictEqual(
                span.spanOffsetToSegmentOffset(0), { segment: span.firstSegment, offset: span.startOffset });
        });
    }

    // tslint:disable:mocha-no-side-effect-code
    test(["0"], 0, 1);
    test(["01"], 0, 1);
    test(["01"], 1, 2);
    test(["012"], 1, 2);
    test(["01", "23"], 1, 3);
    test(["01", "23", "45"], 1, 5);

    it(`Non-zero startOffset`, () => {
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

            // Ensure that initializing the span via the ctor agrees with appending to an empty span.
            assert.deepStrictEqual(new SegmentSpan(position, segment, startOffset, endOffset), span);

            return true;
        }, 0, 4);
    });

    it("spanOffsetToSegmentOffset", () => {
        const span = new SegmentSpan();
        doc.visitRange((position, segment, startOffset, endOffset) => {
            span.append(position, segment, startOffset, endOffset);
            return true;
        }, 1, 3);

        assert.deepStrictEqual(span.spanOffsetToSegmentOffset(0), { segment: span.firstSegment, offset: 1 });
        assert.deepStrictEqual(span.spanOffsetToSegmentOffset(1), { segment: span.lastSegment, offset: 0 });
    });
});
