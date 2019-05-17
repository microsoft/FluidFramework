import { Template } from "@prague/flow-util";
import * as styles from "./index.css";

export const template = new Template({
    tag: "span",
    props: { className: styles.document },
    children: [
        { tag: "span", ref: "leadingSpan", props: { className: styles.leadingSpan }},
        { tag: "span", ref: "slot", props: { className: styles.documentContent }},
        { tag: "span", ref: "trailingSpan", props: { className: styles.trailingSpan }},
        { tag: "span", ref: "overlay", props: { className: styles.documentOverlay }},
    ],
});
