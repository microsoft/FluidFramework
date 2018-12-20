import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { IViewState, View } from "..";

const template = new Template({ 
    tag: "span",
    props: { innerHTML: "&nbsp", className: styles.lineBreak },
    children: [
        { tag: "span", ref: "cursorTarget", props: { className: styles.afterLineBreak }},
        { tag: "br" }
    ]
});

export interface ILineBreakProps {}
export interface ILineBreakViewState extends IViewState {
    cursorTarget?: Node;
}

export class LineBreakView extends View<ILineBreakProps, ILineBreakViewState> {
    public static readonly factory = () => new LineBreakView();

    mounting(props: Readonly<ILineBreakProps>): ILineBreakViewState {
        const root = template.clone();
        const cursorTarget = template.get(root, "cursorTarget");
        return { root, cursorTarget }
    }

    updating(props: Readonly<ILineBreakProps>, state: Readonly<ILineBreakViewState>): ILineBreakViewState {
        return state;
    }

    unmounting(state: Readonly<ILineBreakViewState>) { }
}