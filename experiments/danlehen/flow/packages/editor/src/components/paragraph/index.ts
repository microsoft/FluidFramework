import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { View, IViewState } from "..";

const template = new Template({
    tag: "p",
    props: { className: styles.paragraph },
    children: [
        { tag: "span", ref: "slot", props: { className: styles.paragraphContents }},
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterParagraph, textContent: "\u200b" }}
    ]
});

export interface IParagraphProps {}

export interface IParagraphViewState extends IViewState {
    readonly slot: Element;
    readonly cursorTarget: Node;
}

export class ParagraphView extends View<IParagraphProps, IParagraphViewState> {
    public static readonly instance = new ParagraphView();

    mounting(props: Readonly<IParagraphProps>): IParagraphViewState {
        const root = template.clone();
        const slot = template.get(root, "slot");
        const cursorTarget = template.get(root, "cursorTarget");

        return { root, slot, cursorTarget }
    }

    updating(props: Readonly<IParagraphProps>, state: Readonly<IParagraphViewState>): IParagraphViewState {
        return state;
    }

    unmounting(state: Readonly<IParagraphViewState>) { }
}