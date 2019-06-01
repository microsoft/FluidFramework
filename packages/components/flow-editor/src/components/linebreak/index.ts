import { Char, Template } from "@prague/flow-util";
import { SimpleTemplateView } from "../simpletemplate";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    ref: "cursorTarget",
    props: { className: styles.lineBreak, textContent: Char.zeroWidthSpace },
    children: [{
        tag: "span",
        props: { className: styles.beforeLineBreak, contentEditable: false },
        children: [{ tag: "br" }],
    }],
});

export class LineBreakView extends SimpleTemplateView {
    public static readonly factory = () => new LineBreakView(template);
}
