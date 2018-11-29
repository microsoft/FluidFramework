import { e } from "../../dom";
import * as styles from "./index.css";
import { IViewState, IView } from "..";

const template = e({ 
    tag: "span",
    props: { innerHTML: "&nbsp", className: styles.lineBreak },
    children: [
        { tag: "span", props: { className: styles.afterLineBreak }},
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
        const root = template.cloneNode(true) as Element;
        return { root, cursorTarget: root.firstChild! }
    }

    update(props: Readonly<ILineBreakProps>, state: Readonly<ILineBreakViewState>): ILineBreakViewState {
        return state;
    }

    unmount(state: Readonly<ILineBreakViewState>) { }
}