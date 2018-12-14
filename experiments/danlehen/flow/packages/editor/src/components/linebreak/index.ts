import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { IViewState, IView } from "..";

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

export class LineBreakView implements IView<ILineBreakProps, ILineBreakViewState> {
    public static readonly instance = new LineBreakView();

    constructor() {}

    mount(props: Readonly<ILineBreakProps>): ILineBreakViewState {
        const root = template.clone();
        const cursorTarget = template.get(root, "cursorTarget");
        return { root, cursorTarget }
    }

    update(props: Readonly<ILineBreakProps>, state: Readonly<ILineBreakViewState>): ILineBreakViewState {
        return state;
    }

    unmount(state: Readonly<ILineBreakViewState>) { }
}