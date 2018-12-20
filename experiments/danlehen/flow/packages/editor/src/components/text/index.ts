import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { IViewState, View } from "..";

const template = new Template({ tag: "span", props: { className: styles.text }});

export interface ITextProps {
    text: string
}

export interface ITextViewState extends IViewState {
    readonly root: Element;
    readonly cursorTarget?: Node;
}

export class TextView extends View<ITextProps, ITextViewState> {
    public static readonly instance = new TextView();

    mounting(props: Readonly<ITextProps>): ITextViewState {
        return this.update(props, { root: template.clone() });
    }

    updating(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState {
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

    unmounting(state: Readonly<ITextViewState>) { }
}