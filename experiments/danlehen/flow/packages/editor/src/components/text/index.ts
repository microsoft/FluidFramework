import { e } from "../../dom";
import * as styles from "./index.css";
import { IViewState, IView } from "..";

const template = e({ tag: "span", props: { className: styles.text }});

export interface ITextProps {
    text: string
}

export interface ITextViewState extends IViewState {
    readonly root: Element;
    readonly cursorTarget?: Node;
}

export class TextView implements IView<ITextProps, ITextViewState> {
    public static readonly instance = new TextView();

    constructor() {}

    mount(props: Readonly<ITextProps>): ITextViewState {
        const root = template.cloneNode(true) as Element;
        return this.update(props, { root });
    }

    update(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState {
        console.assert(props.text !== "",
            "Should not emit a TextView for empty text.");

        const root = state.root;
        if (root.textContent === props.text) {
            return state;
        }

        root.textContent = props.text;

        // Note: As long as textContent is not empty, the <span> must have a firstChild.
        return { root, cursorTarget: root.firstChild! };
    }

    unmount(state: Readonly<ITextViewState>) { }
}