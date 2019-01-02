import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { IFlowViewComponentState, FlowViewComponent } from "..";

const template = new Template({ tag: "span", props: { className: styles.text }});

export interface ITextProps {
    text: string
}

export interface ITextViewState extends IFlowViewComponentState { }

export class TextView extends FlowViewComponent<ITextProps, ITextViewState> {
    public static readonly factory = () => new TextView();

    public mounting(props: Readonly<ITextProps>): ITextViewState {
        const root = template.clone();
        return this.updating(props, { root, cursorTarget: root });
    }

    public updating(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState {
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

    public unmounting(state: Readonly<ITextViewState>) { }
}