/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char } from "@prague/flow-util";
import { TextSegment } from "@prague/merge-tree";
import { Tag } from "../util/tag";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { Layout } from "../view/layout";

class PlainTextFormatter extends RootFormatter<IFormatterState> {
    public begin(layout: Layout) {
        const e = this.pushTag(layout, Tag.pre);
        e.style.whiteSpace = "pre-wrap";
    }

    public end(layout: Layout) {
        layout.popNode();
    }

    public visit(layout: Layout) {
        const segment = layout.segment;

        if (TextSegment.is(segment)) {
            layout.emitText();
        } else {
            layout.emitNode(document.createTextNode(Char.replacementCharacter));
        }

        return true;
    }

    public onChange() { }
}

export const plainTextFormatter = Object.freeze(new PlainTextFormatter());
