import { Template } from "@prague/flow-util";
import { FlowViewComponent, IFlowViewComponentState } from "..";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    props: { innerHTML: "&nbsp", className: styles.lineBreak },
    children: [
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterLineBreak }},
        { tag: "br" },
    ],
});

// tslint:disable-next-line:no-empty-interface
export interface ILineBreakProps {}
// tslint:disable-next-line:no-empty-interface
export interface ILineBreakViewState extends IFlowViewComponentState { }

export class LineBreakView extends FlowViewComponent<ILineBreakProps, ILineBreakViewState> {
    public static readonly factory = () => new LineBreakView();

    public mounting(props: Readonly<ILineBreakProps>): ILineBreakViewState {
        const root = template.clone();
        const cursorTarget = template.get(root, "cursorTarget");
        return { root, cursorTarget };
    }

    public updating(props: Readonly<ILineBreakProps>, state: Readonly<ILineBreakViewState>): ILineBreakViewState {
        return state;
    }

    public unmounting(state: Readonly<ILineBreakViewState>) { /* do nothing */ }
}
