/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedString } from "@fluidframework/sequence";
import React, { useEffect, useRef, useState } from "react";
import { ISharedStringHelperTextChangedEventArgs, SharedStringHelper } from "./SharedStringHelper";

export interface ICollaborativeTextAreaProps {
    /**
     * The SharedString that will store the text from the textarea.
     */
    sharedString: SharedString;
    /**
     * Whether spellCheck should be enabled.  Defaults to false.
     */
    spellCheck?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export interface ICollaborativeTextAreaState {
    selectionEnd: number;
    selectionStart: number;
    text: string;
}

export interface ICollaborativeTextAreaFunctionProps {
    /**
     * The SharedString that will store the text from the textarea.
     */
    sharedStringHelper: SharedStringHelper;
    /**
     * Whether spellCheck should be enabled.  Defaults to false.
     */
    spellCheck?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

export const CollaborativeTextAreaFunction: React.FC<ICollaborativeTextAreaFunctionProps> =
    (props: ICollaborativeTextAreaFunctionProps) => {
        const {
            sharedStringHelper,
            spellCheck,
            className,
            style,
        } = props;

        // eslint-disable-next-line no-null/no-null
        const textareaRef = useRef<HTMLTextAreaElement>(null);
        const selectionStartRef = useRef<number>(0);
        const selectionEndRef = useRef<number>(0);

        const [text, setText] = useState<string>(sharedStringHelper.getText());

        /**
         * There's been a local change to the textarea content (e.g. user did some typing)
         * This means the most-recent state (text and selection) is in the textarea, and we need to
         * 1. Store the text and selection state in React
         * 2. Store the text state in the SharedString
         */
        const handleChange = (ev: React.FormEvent<HTMLTextAreaElement>) => {
            // First get and stash the new textarea state
            if (!textareaRef.current) {
                throw new Error("Handling change without current textarea ref?");
            }
            const textareaElement = textareaRef.current;
            const newText = textareaElement.value;
            // After a change to the textarea content we assume the selection is gone (just a caret)
            // This is a bad assumption (e.g. performing undo will select the re-added content).
            const newCaretPosition = textareaElement.selectionStart;

            // Next get and stash the old React state
            const oldText = text;
            const oldSelectionStart = selectionStartRef.current;
            const oldSelectionEnd = selectionEndRef.current;

            // Next update the React state with the values from the textarea
            storeSelectionInReact();
            setText(newText);

            // Finally update the SharedString with the values after deducing what type of change it was.
            // If the caret moves to the right of the prior left bound of the selection, we assume an insert occurred
            // This is also a bad assumption, in the undo case.
            const isTextInserted = newCaretPosition - oldSelectionStart > 0;
            if (isTextInserted) {
                const insertedText = newText.substring(oldSelectionStart, newCaretPosition);
                const isTextReplaced = oldSelectionEnd - oldSelectionStart > 0;
                if (!isTextReplaced) {
                    sharedStringHelper.insertText(insertedText, oldSelectionStart);
                } else {
                    sharedStringHelper.replaceText(insertedText, oldSelectionStart, oldSelectionEnd);
                }
            } else {
                // Text was removed
                const charactersDeleted = oldText.length - newText.length;
                sharedStringHelper.removeText(newCaretPosition, newCaretPosition + charactersDeleted);
            }
        };

        /**
         * Set the selection in the DOM textarea itself (updating the UI).
         */
        const setTextareaSelection = (newStart: number, newEnd: number) => {
            if (!textareaRef.current) {
                throw new Error("Trying to set selection without current textarea ref?");
            }
            const textareaElement = textareaRef.current;

            textareaElement.selectionStart = newStart;
            textareaElement.selectionEnd = newEnd;
        };

        /**
         * Take the current selection from the DOM textarea and store it in our React ref.
         */
        const storeSelectionInReact = () => {
            if (!textareaRef.current) {
                throw new Error("Trying to remember selection without current textarea ref?");
            }
            const textareaElement = textareaRef.current;

            const textareaSelectionStart = textareaElement.selectionStart;
            const textareaSelectionEnd = textareaElement.selectionEnd;
            selectionStartRef.current = textareaSelectionStart;
            selectionEndRef.current = textareaSelectionEnd;
        };

        useEffect(
            () => {
                /**
                 * There's been a change to the SharedString's data.  This means the most recent state of the text
                 * is in the SharedString, and we need to
                 * 1. Store the text state in React
                 * 2. If the change came from a remote source, it may have moved our selection.  Compute it, update
                 *    the textarea, and store it in React
                 */
                const handleTextChanged = (event: ISharedStringHelperTextChangedEventArgs) => {
                    const newText = sharedStringHelper.getText();
                    setText(newText);

                    // If the event was our own then the caret will already be in the new location.
                    // Otherwise, transform our selection position based on the change.
                    if (!event.isLocal) {
                        const newSelectionStart = event.transformPosition(selectionStartRef.current);
                        const newSelectionEnd = event.transformPosition(selectionEndRef.current);
                        setTextareaSelection(newSelectionStart, newSelectionEnd);
                        storeSelectionInReact();
                    }
                };

                sharedStringHelper.on("textChanged", handleTextChanged);
                return () => {
                    sharedStringHelper.off("textChanged", handleTextChanged);
                };
            },
            [sharedStringHelper],
        );

        return (
            // There are a lot of different ways content can be inserted into a textarea
            // and not all of them trigger a onBeforeInput event. To ensure we are grabbing
            // the correct selection before we modify the shared string we need to make sure
            // this.updateSelection is being called for multiple cases.
            <textarea
                rows={20}
                cols={50}
                ref={textareaRef}
                className={className}
                style={style}
                spellCheck={spellCheck ? spellCheck : false}
                onBeforeInput={storeSelectionInReact}
                onKeyDown={storeSelectionInReact}
                onClick={storeSelectionInReact}
                onContextMenu={storeSelectionInReact}
                // onChange is recommended over onInput for React controls
                // https://medium.com/capital-one-tech/how-to-work-with-forms-inputs-and-events-in-react-c337171b923b
                onChange={handleChange}
                value={text} />
        );
    };

/**
 * Given a SharedString will produce a collaborative textarea.
 */
export class CollaborativeTextArea
    extends React.Component<ICollaborativeTextAreaProps, ICollaborativeTextAreaState> {
    private readonly ref: React.RefObject<HTMLTextAreaElement>;

    constructor(props: ICollaborativeTextAreaProps) {
        super(props);

        this.ref = React.createRef<HTMLTextAreaElement>();

        this.state = {
            selectionEnd: 0,
            selectionStart: 0,
            text: this.props.sharedString.getText(),
        };

        this.handleChange = this.handleChange.bind(this);
        this.updateSelection = this.updateSelection.bind(this);
    }

    public componentDidMount() {
        // Sets an event listener so we can update our state as the value changes

        this.props.sharedString.on("sequenceDelta", (event) => {
            const newText = this.props.sharedString.getText();
            // We only need to insert if the text changed.
            if (newText === this.state.text) {
                return;
            }

            // If the event is our own then just insert the text
            if (event.isLocal) {
                this.setState({ text: newText });
                return;
            }

            // Because we did not make the change we need to manage the remote
            // character insertion.
            const remoteCaretStart = event.first.position;
            const remoteCaretEnd = event.last.position + event.last.segment.cachedLength;
            const charactersModifiedCount = newText.length - this.state.text.length;

            this.updateSelection();
            const currentCaretStart = this.state.selectionStart;
            const currentCaretEnd = this.state.selectionEnd;

            let newCaretStart = 0;
            let newCaretEnd = 0;

            // Remote text inserted/removed after our cp range
            if (currentCaretEnd <= remoteCaretStart) {
                // cp stays where it was before.
                newCaretStart = currentCaretStart;
                newCaretEnd = currentCaretEnd;
            } else if (currentCaretStart > (remoteCaretEnd - 1)) {
                // Remote text inserted/removed before our cp range
                // We need to move our cp the number of characters inserted/removed
                // to ensure we are in the same position
                newCaretStart = currentCaretStart + charactersModifiedCount;
                newCaretEnd = currentCaretEnd + charactersModifiedCount;
            } else {
                // Remote text is overlapping cp

                // The remote changes occurred inside current selection
                if (remoteCaretEnd <= currentCaretEnd && remoteCaretStart > currentCaretStart) {
                    // Our selection needs to include remote changes
                    newCaretStart = currentCaretStart;
                    newCaretEnd = currentCaretEnd + charactersModifiedCount;
                } else if (remoteCaretEnd >= currentCaretEnd && remoteCaretStart <= currentCaretStart) {
                    // The remote changes encompass our location

                    // Our selection has been removed
                    // Move our cp to the beginning of the new text insertion
                    newCaretStart = remoteCaretStart;
                    newCaretEnd = remoteCaretStart;
                } else {
                    // We have partial overlapping selection with the changes.
                    // This makes things a lot harder to manage so for now we will just remove the current selection
                    // and place it to the remote caret start.
                    // TODO: implement this the correct way
                    newCaretStart = remoteCaretStart;
                    newCaretEnd = remoteCaretStart;
                }
            }

            this.setState({ text: newText });
            this.setCaretPosition(newCaretStart, newCaretEnd);
        });
    }

    private setCaretPosition(newStart: number, newEnd: number) {
        if (this.ref.current) {
            this.ref.current.selectionStart = newStart;
            this.ref.current.selectionEnd = newEnd;
        }
    }

    // componentDidUpdate(){
    //     this.setCaretPosition(this.state.selectionStart, this.state.selectionEnd);
    // }

    public render() {
        return (
            // There are a lot of different ways content can be inserted into a textarea
            // and not all of them trigger a onBeforeInput event. To ensure we are grabbing
            // the correct selection before we modify the shared string we need to make sure
            // this.updateSelection is being called for multiple cases.
            <textarea
                rows={20}
                cols={50}
                ref={this.ref}
                className={this.props.className}
                style={this.props.style}
                spellCheck={this.props.spellCheck ? this.props.spellCheck : false}
                onBeforeInput={this.updateSelection}
                onKeyDown={this.updateSelection}
                onClick={this.updateSelection}
                onContextMenu={this.updateSelection}
                // onChange is recommended over onInput for React controls
                // https://medium.com/capital-one-tech/how-to-work-with-forms-inputs-and-events-in-react-c337171b923b
                onChange={this.handleChange}
                value={this.state.text} />
        );
    }

    private handleChange(ev: React.FormEvent<HTMLTextAreaElement>) {
        // We need to set the value here to keep the input responsive to the user
        const newText = ev.currentTarget.value;
        const charactersModifiedCount = this.state.text.length - newText.length;
        this.setState({ text: newText });

        // Get the new caret position and use that to get the text that was inserted
        const newPosition = ev.currentTarget.selectionStart ? ev.currentTarget.selectionStart : 0;
        const isTextInserted = newPosition - this.state.selectionStart > 0;
        if (isTextInserted) {
            const insertedText = newText.substring(this.state.selectionStart, newPosition);
            const changeRangeLength = this.state.selectionEnd - this.state.selectionStart;
            if (changeRangeLength === 0) {
                this.props.sharedString.insertText(this.state.selectionStart, insertedText);
            } else {
                this.props.sharedString.replaceText(this.state.selectionStart, this.state.selectionEnd, insertedText);
            }
        } else {
            // Text was removed
            this.props.sharedString.removeText(newPosition, newPosition + charactersModifiedCount);
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
        this.setState({ selectionEnd, selectionStart });
    }
}
