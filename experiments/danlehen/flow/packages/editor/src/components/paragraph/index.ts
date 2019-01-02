import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { FlowViewComponent, IFlowViewComponentState } from "..";

const template = new Template({
    tag: "p",
    props: { className: styles.paragraph },
    children: [
        { tag: "span", ref: "slot", props: { className: styles.paragraphContents }},
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterParagraph, textContent: "\u200b" }}
    ]
});

export interface IParagraphProps {}

export interface IParagraphViewState extends IFlowViewComponentState {
    readonly slot: Element;
}

export class ParagraphView extends FlowViewComponent<IParagraphProps, IParagraphViewState> {
    public static readonly factory = () => new ParagraphView();

    public mounting(props: Readonly<IParagraphProps>): IParagraphViewState {
        const root = template.clone();
        const slot = template.get(root, "slot");
        const cursorTarget = template.get(root, "cursorTarget");

        return { root, slot, cursorTarget }
    }

    public updating(props: Readonly<IParagraphProps>, state: Readonly<IParagraphViewState>): IParagraphViewState {
        return state;
    }

    public unmounting(state: Readonly<IParagraphViewState>) { }

    public get slot() { return this.state.slot; }
}