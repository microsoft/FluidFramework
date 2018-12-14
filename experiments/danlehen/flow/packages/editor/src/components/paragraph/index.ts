import { e } from "@prague/flow-util";
import * as styles from "./index.css";
import { IView, IViewState } from "..";

const template = e({
    tag: "p",
    props: { className: styles.paragraph },
    children: [
        { tag: "span", props: { className: styles.paragraphContents }},
        { tag: "span", props: { className: styles.afterParagraph, textContent: "\u200b" }}
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
        const root = template.cloneNode(true) as Element;

        // Note: 'slot' and cursorTarget' cannot be 'null' per the structure of the 'template'.
        const slot = root.firstElementChild!;
        const cursorTarget = root.lastElementChild!.firstChild!;

        return { root, slot, cursorTarget }
    }

    update(props: Readonly<IParagraphProps>, state: Readonly<IParagraphViewState>): IParagraphViewState {
        return state;
    }

    unmount(state: Readonly<IParagraphViewState>) { }
}