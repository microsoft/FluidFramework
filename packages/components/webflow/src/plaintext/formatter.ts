/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextSegment } from "@prague/merge-tree";
import { getDocSegmentKind } from "../document";
import { Formatter, IFormatterState } from "../view/formatter";
import { Layout } from "../view/layout";

class PlainTextFormatter extends Formatter<IFormatterState> {
    public begin(): never { throw new Error(); }
    public end(): never { throw new Error(); }

    public visit(layout: Layout) {
        const segment = layout.segment;

        if (TextSegment.is(segment)) {
            layout.emitText();
        } else {
            console.warn(`Not 'text/plaintext': '${getDocSegmentKind(segment)}'`);
        }

        return true;
    }
}

export const plainTextFormatter = Object.freeze(new PlainTextFormatter());
