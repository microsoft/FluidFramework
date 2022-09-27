/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";
import { ISharedStringHelperTextChangedEventArgs, SharedStringHelper } from "./SharedStringHelper";

export interface ICollaborativeTextAreaProps {
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

export const CollaborativeTextArea: React.FC<ICollaborativeTextAreaProps> = (props: ICollaborativeTextAreaProps) => {
    const {
        sharedStringHelper,
        spellCheck,
        className,
        style,
    } = props;
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
             * There's been a change to the SharedString's data.
             * This means the most recent state of the text is in the SharedString, and we need to...
             *
             * 1. Store the text state in React
             *
             * 2. If the change came from a remote source, it may have moved our selection.
             * Compute it, update the textarea, and store it in React
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
