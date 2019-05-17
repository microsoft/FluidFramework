import { Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";
import * as styles from "./index.css";

export { TextLayout } from "./layout";

const template = new Template({ tag: "p", props: { className: styles.text }});

export interface ITextProps {
    text: string;
    classList: string;
}

// tslint:disable-next-line:no-empty-interface
export interface ITextViewState extends IViewState { }

export class TextView extends FlowViewComponent<ITextProps, ITextViewState> {
    public static readonly factory = () => new TextView();

    public mounting(props: Readonly<ITextProps>): ITextViewState {
        return this.updating(props, { root: template.clone() });
    }

    // Note: As long as textContent is not empty, the <span> must have a firstChild.
    public get cursorTarget() { return this.state.root.firstChild; }

    public updating(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState {
        console.assert(props.text !== "",
            "Should not emit a TextView for empty text.");

        const root = state.root;

        const text = props.text;
        if (root.textContent !== text) {
            root.textContent = text;
        }

        const classList = props.classList;
        const className = classList.length > 0
            ? `${styles.text} ${props.classList}`
            : styles.text;

        if (root.className !== className) {
            root.className = className;
        }

        return state;
    }

    public unmounting(state: Readonly<ITextViewState>) { /* do nothing */ }
}
