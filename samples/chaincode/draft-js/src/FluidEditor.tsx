/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMap } from "@microsoft/fluid-map";
import { IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { SequenceDeltaEvent, SharedString } from "@microsoft/fluid-sequence";
import { ContentState, Editor, EditorProps, EditorState, RichUtils } from "draft-js";
import * as React from "react";

import { getCoauthPresenceDecorator, PresenceManager } from "./PresenceManager";
import {
    blockRangeToSelection,
    draftStyleToSharedTextProp,
    getMarkersInBlockRange,
    insertBlockStart,
    selectionToTextRange,
    sharedStringToBlockArary,
    TextRange,
    textRangeToBlockTextRange,
    updateTextRange,
} from "./RichTextAdapter";
import { BlockStyleControls, InlineStyleControls } from "./StyleControls";

// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "./css/RichEditor.css";

interface IProps extends Partial<EditorProps> {
    sharedString: SharedString;
    authors: SharedMap;
    runtime: IComponentRuntime;
}

interface IState {
    editorState: EditorState;
}

export { IProps as IFluidEditorProps };
export { IState as IFluidEditorState };

const styleMap = {
    CODE: {
        backgroundColor: "rgba(0, 0, 0, 0.05)",
        fontFamily: '"Inconsolata", "Menlo", "Consolas", monospace',
        fontSize: 16,
        padding: 2,
    },
};

const getBlockStyle = (block) => {
    switch (block.getType()) {
        case "blockquote":
            return "RichEditor-blockquote";
        case "unstyled":
            return "RichEditor-paragraph";
        default:
            return null;
    }
};

/**
 * A wrapper around the Draft.js Editor component which connects RichUtils and callbacks to connect Fluid
 */
export class FluidEditor extends React.Component<IProps, IState> {
    private readonly presenceManager: PresenceManager;

    constructor(props: IProps) {
        super(props);

        const contentState = ContentState.createFromBlockArray(sharedStringToBlockArary(this.props.sharedString));
        let editorState = EditorState.createWithContent(contentState);

        this.presenceManager = new PresenceManager(this.props.authors, this.props.runtime);

        editorState = EditorState.set(editorState, {
            decorator: getCoauthPresenceDecorator(this.presenceManager),
        });

        this.state = {
            editorState,
        };
    }

    private readonly updateEditorState = (updateSelectionRange: (range: TextRange) => TextRange): void => {
        let blocks = sharedStringToBlockArary(this.props.sharedString);
        blocks = this.presenceManager.addPresencePlaceholders(blocks);
        const newContent = ContentState.createFromBlockArray(blocks);
        let editorState = EditorState.push(this.state.editorState, newContent, "change-block-data");

        let selection = this.state.editorState.getSelection();
        if (selection.getHasFocus()) {
            let selectionTextRange = selectionToTextRange(selection, this.state.editorState.getCurrentContent());
            selectionTextRange = updateSelectionRange(selectionTextRange);
            const updatedBlockRange = textRangeToBlockTextRange(selectionTextRange, editorState.getCurrentContent());
            selection = blockRangeToSelection(updatedBlockRange, selection.getHasFocus());
            editorState = EditorState.forceSelection(editorState, selection);
        }

        this.setState({ editorState });
    };

    componentDidMount() {
        // Give everything a moment to render before rushing into rendering coauth positions.
        setTimeout(() => {
            this.presenceManager.subscribe(this.updateEditorState);
        }, 200);
    }

    // eslint-disable-next-line react/no-deprecated
    componentWillMount() {
        this.props.sharedString.on("sequenceDelta", (event: SequenceDeltaEvent) => {
            try {
                // We've already rendered local changes.
                if (event.isLocal) {
                    return;
                }

                const updateSelectionRange = (textRange: TextRange) => updateTextRange(event.ranges, textRange);
                this.updateEditorState(updateSelectionRange);
            } catch (exception) {
                console.error(exception);
                debugger;
            }
        });
    }

    private readonly onChange = (editorState: EditorState, changedStyle?: string) => {
        // Store some important variables so we can use them later.
        const newContent = editorState.getCurrentContent();
        // Represent each block marker prefix as a newline, remove presence placeholders
        const newText = `\n${this.presenceManager.removePlaceholderChars(newContent.getPlainText())}`;
        const newSelection = editorState.getSelection();

        const oldContent = this.state.editorState.getCurrentContent();
        const oldSelection = this.state.editorState.getSelection();

        if (newSelection !== oldSelection) {
            const publishedPosition = newSelection.getHasFocus()
                ? this.presenceManager.subtractCoauthorPlaceholders(selectionToTextRange(newSelection, newContent))
                : undefined;
            this.presenceManager.publish(publishedPosition);
        }

        if (newContent !== oldContent) {
            let { start, end } = this.presenceManager.subtractCoauthorPlaceholders(
                selectionToTextRange(oldSelection, oldContent),
            );

            const changeType = editorState.getLastChangeType();
            if (changeType === "insert-characters" || changeType === "insert-fragment") {
                const newSelectionAbsolute = this.presenceManager.subtractCoauthorPlaceholders(
                    selectionToTextRange(newSelection, newContent),
                );
                const insertedText = newText.substring(start, newSelectionAbsolute.end);

                if (insertedText.includes("\n")) {
                    debugger; //TODO Can you paste newlines?
                }

                const styleProp = draftStyleToSharedTextProp(editorState.getCurrentInlineStyle());
                if (end - start) {
                    // If there are selected characters we need to replace
                    this.props.sharedString.replaceText(start, end, insertedText, styleProp);
                } else {
                    // Text was simply inserted
                    this.props.sharedString.insertText(start, insertedText, styleProp);
                }
            } else if (
                changeType === "delete-character" ||
                changeType === "remove-range" ||
                changeType === "backspace-character"
            ) {
                if (changeType === "delete-character") {
                    end++;
                } else if (changeType === "backspace-character") {
                    start--;
                }
                this.props.sharedString.removeText(start, end);
            } else if (changeType === "split-block") {
                const newBlock = newContent.getBlockAfter(oldSelection.getEndKey());
                insertBlockStart(this.props.sharedString, start, newBlock.getKey(), newBlock.getType());
            } else if (changeType === "change-inline-style") {
                if (!changedStyle) {
                    throw new Error("Expected changedStyle to be set for style changes");
                }
                const styleProp = draftStyleToSharedTextProp(editorState.getCurrentInlineStyle(), changedStyle);
                this.props.sharedString.annotateRange(start, end, styleProp);
            } else if (changeType === "change-block-type") {
                const markers = getMarkersInBlockRange(
                    this.props.sharedString,
                    oldSelection.getStartKey(),
                    oldSelection.getEndKey(),
                );
                const newType = newContent.getBlockForKey(oldSelection.getStartKey()).getType();
                for (const marker of markers) {
                    this.props.sharedString.annotateMarker(marker, { blockType: newType });
                }
            } else if (changeType === "undo" || changeType === "redo") {
                /**
                 * TODO Not yet implemented There are two issues here:
                 *
                 *  1. We need syncs from coauthors to be excluded from the undo stack (they currently aren't)
                 *  2. We need to convert the undo/redo events into some kind of diff that can be applied to the
                 *     SharedString For now, force the selection back to how it was and ignore the event
                 */
                this.setState({
                    editorState: EditorState.acceptSelection(
                        this.state.editorState, this.state.editorState.getSelection()),
                });
                return;
            }
        }

        // If nothing has changed there might have been something minor so we still want to update the editorState.
        this.setState({ editorState });
    };

    private readonly handleKeyCommand = (command, editorState) => {
        const newState = RichUtils.handleKeyCommand(editorState, command);
        if (newState) {
            this.onChange(newState, command);
            return "handled";
        }
        return "not-handled";
    };

    private readonly toggleInlineStyle = (inlineStyle: string) => {
        this.onChange(RichUtils.toggleInlineStyle(this.state.editorState, inlineStyle), inlineStyle);
    };

    private readonly toggleBlockType = (blockType) => {
        this.onChange(RichUtils.toggleBlockType(this.state.editorState, blockType));
    };

    render() {
        // TODO Pass through props to Editor
        return (
            <div className="RichEditor-root">
                <div className="RichEditor-toolbar">
                    <InlineStyleControls editorState={this.state.editorState} onToggle={this.toggleInlineStyle} />
                    <BlockStyleControls editorState={this.state.editorState} onToggle={this.toggleBlockType} />
                </div>
                <div className="RichEditor-editor">
                    <Editor
                        editorState={this.state.editorState}
                        onChange={this.onChange}
                        handleKeyCommand={this.handleKeyCommand}
                        blockStyleFn={getBlockStyle}
                        customStyleMap={styleMap}
                    />
                </div>
            </div>
        );
    }
}
