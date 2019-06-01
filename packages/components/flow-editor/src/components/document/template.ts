import { Char, Template } from "@prague/flow-util";
import * as styles from "./index.css";

export const template = new Template({
    tag: "span",
    props: { className: styles.document },
    children: [
        { tag: "span", props: { className: styles.documentContent }, children: [
            { tag: "span", ref: "leadingSpan", props: { textContent: Char.zeroWidthSpace }},
            { tag: "span", ref: "slot" },
            { tag: "span", ref: "trailingSpan", props: { textContent: Char.zeroWidthSpace }},
        ]},
        { tag: "span", ref: "overlay", props: { className: styles.documentOverlay }},
    ],
});
