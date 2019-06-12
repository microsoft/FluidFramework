import { Char, Template } from "@prague/flow-util";
import * as style from "./index.css";

export const template = new Template({
    tag: "span",
    props: { className: style.document },
    children: [
        { tag: "span", props: { className: style.documentContent }, children: [
            { tag: "span", ref: "leadingSpan", props: { textContent: Char.zeroWidthSpace }},
            { tag: "span", ref: "slot" },
            { tag: "span", ref: "trailingSpan", props: { className: style.trailingSpan, textContent: Char.zeroWidthSpace }},
        ]},
        { tag: "span", ref: "overlay", props: { className: style.documentOverlay }},
    ],
});
