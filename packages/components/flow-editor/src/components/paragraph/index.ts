import { Char, Template } from "@prague/flow-util";
import { SimpleTemplateView } from "../simpletemplate";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    ref: "cursorTarget",
    props: { className: styles.paragraph, textContent: Char.zeroWidthSpace },
    children: [{
        tag: "span",
        props: { className: styles.beforeParagraph, contentEditable: false },
        children: [{ tag: "p" }],
    }],
});

export class ParagraphView extends SimpleTemplateView {
    public static readonly factory = () => new ParagraphView(template);
}
