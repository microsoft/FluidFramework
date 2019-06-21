/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Char, Template } from "@prague/flow-util";
import { MarkerView } from "../marker";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    ref: "cursorTarget",
    props: { className: styles.paragraph, textContent: Char.zeroWidthSpace },
    children: [{
        tag: "span",
        props: { className: styles.beforeParagraph },
        children: [{ tag: "p" }],
    }],
});

export class ParagraphView extends MarkerView {
    public static readonly factory = () => new ParagraphView(template);
}
