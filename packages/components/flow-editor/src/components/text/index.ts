import { Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";
import * as style from "./index.css";

export { TextLayout } from "./layout";

const template = new Template({ tag: "p", props: { className: style.text }});

export interface ITextProps {
    text: string;
    style?: string;
    classList?: string;
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
        const { text, classList } = props;
        console.assert(text, "Should not emit a TextView for empty text.");

        // Ensure the text content of the <p> tag is up to date (note that 'text' must be non-empty,
        // therefore a simple strict equality check will suffice.)
        const root = state.root;
        if (root.textContent !== text) {
            root.textContent = text;
        }

        // The <p> tag's 'className' is the 'style.text' style followed by any CSS style classes
        // listed in 'props.classList'.
        const className = classList
            ? `${style.text} ${props.classList}`
            : style.text;

        // Ensure the <p> tag's 'className' and 'style' properties are up to date.
        this.syncCss(root as HTMLElement, className, props.style);

        return state;
    }

    public unmounting(state: Readonly<ITextViewState>) { /* do nothing */ }
}
