/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedString } from "@prague/sequence";

import * as React from "react";

interface IProps {
    sharedString: SharedString;
    style?: React.CSSProperties;
    spellCheck?: boolean;
}

interface IState {
    selectionEnd: number;
    selectionStart: number;
    text: string;
}

/**
 * Given a SharedString will produce a collaborative input element.
 */
export class CollaborativeInput extends React.Component<IProps, IState> {
    private readonly ref: React.RefObject<HTMLInputElement>;

    constructor(props: IProps) {
        super(props);

        this.ref = React.createRef<HTMLInputElement>();

        this.state = {
            selectionEnd: 0,
            selectionStart: 0,
            text: this.props.sharedString.getText(),
        };

        this.handleChange = this.handleChange.bind(this);
        this.updateSelection = this.updateSelection.bind(this);
    }

    public componentWillMount() {
        // Sets an event listener so we can update our state as the value changes
        this.props.sharedString.on("op", () => {
            // We'll only update the text on a new op if the text is different.
            // This prevents the Element from being unnecessarily rendered.
            const text = this.props.sharedString.getText();
            if (text !== this.state.text) {
                this.setState({text});
            }
        });
    }

    public render() {
        return(
            // There are a lot of different ways content can be inserted into a input box
            // and not all of them trigger a onBeforeInput event. To ensure we are grabbing
            // the correct selection before we modify the shared string we need to make sure
            // this.updateSelection is being called for multiple cases.
            <input
                style={this.props.style}
                spellCheck={this.props.spellCheck ? this.props.spellCheck : true}
                ref={this.ref}
                onBeforeInput={this.updateSelection}
                onKeyDown={this.updateSelection}
                onClick={this.updateSelection}
                onContextMenu={this.updateSelection}
                onInput={this.handleChange}
                value={this.state.text}/>
        );
    }

    private handleChange(ev: React.FormEvent<HTMLInputElement>) {
        // We need to set the value here to keep the input responsive to the user
        const newText = ev.currentTarget.value;
        this.setState({text: newText});

        // Get the new caret position and use that to get the text that was inserted
        const newPosition = ev.currentTarget.selectionStart ? ev.currentTarget.selectionStart : 0;
        const insertedText = newText.substring(this.state.selectionStart, newPosition);
        const changeRangeLength = this.state.selectionEnd - this.state.selectionStart;
        if (insertedText) {
            if (changeRangeLength === 0) {
                this.props.sharedString.insertText(insertedText, this.state.selectionStart);
            } else {
                this.props.sharedString.replaceText(this.state.selectionStart, this.state.selectionEnd, insertedText);
            }
        } else {
            this.props.sharedString.removeText(newPosition, this.state.selectionEnd);
        }
    }

    /**
     * Update the current caret selection.
     * We need to do this before we do any handleChange action or we will have lost our
     * cursor position and not be able to accurately update the shared string.
     */
    private updateSelection() {
        if (!this.ref.current) {
            return;
        }

        const selectionEnd = this.ref.current.selectionEnd ? this.ref.current.selectionEnd : 0;
        const selectionStart = this.ref.current.selectionStart ? this.ref.current.selectionStart : 0;
        this.setState({selectionEnd, selectionStart});
    }
}
