import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { IView, IViewState } from "..";

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

export class ParagraphView implements IView<IParagraphProps, IParagraphViewState> {
    public static readonly instance = new ParagraphView();

    constructor() {}

    mount(props: Readonly<IParagraphProps>): IParagraphViewState {
        const root = template.clone();
        const slot = template.get(root, "slot");
        const cursorTarget = template.get(root, "cursorTarget");

        return { root, slot, cursorTarget }
    }

    update(props: Readonly<IParagraphProps>, state: Readonly<IParagraphViewState>): IParagraphViewState {
        return state;
    }

    unmount(state: Readonly<IParagraphViewState>) { }
}