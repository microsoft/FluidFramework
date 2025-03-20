/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SequenceDeltaEvent, SharedString } from "@fluidframework/sequence/legacy";
import React from "react";

/**
 * {@link CollaborativeInput} input props.
 * @internal
 */
export interface ICollaborativeInputProps {
	/**
	 * The SharedString that will store the input value.
	 */
	sharedString: SharedString;

	/**
	 * Whether or not the control should be {@link https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#readonly | read-only}.
	 * @defaultValue `false`
	 */
	readOnly?: boolean;

	/**
	 * Whether spellCheck should be enabled.
	 * @defaultValue `true`
	 */
	spellCheck?: boolean;
	className?: string;
	style?: React.CSSProperties;
	disabled?: boolean;
	onInput?: (sharedString: SharedString) => void;
}

/**
 * {@link CollaborativeInput} component state.
 * @internal
 */
export interface ICollaborativeInputState {
	selectionEnd: number;
	selectionStart: number;
}

/**
 * Given a {@link @fluidframework/sequence#SharedString}, will produce a collaborative input element.
 * @internal
 */
export class CollaborativeInput extends React.Component<
	ICollaborativeInputProps,
	ICollaborativeInputState
> {
	private readonly inputElementRef: React.RefObject<HTMLInputElement>;

	constructor(props: ICollaborativeInputProps) {
		super(props);

		this.inputElementRef = React.createRef<HTMLInputElement>();

		this.state = {
			selectionEnd: 0,
			selectionStart: 0,
		};

		this.handleInput = this.handleInput.bind(this);
		this.updateSelection = this.updateSelection.bind(this);
	}

	public componentDidMount() {
		// Sets an event listener so we can update our state as the value changes
		this.props.sharedString.on("sequenceDelta", (ev: SequenceDeltaEvent) => {
			if (!ev.isLocal) {
				this.updateInputFromSharedString();
			}
		});
		this.updateInputFromSharedString();
	}

	public componentDidUpdate(prevProps: ICollaborativeInputProps) {
		// If the component gets a new sharedString props it needs to re-fetch the sharedString text
		if (prevProps.sharedString !== this.props.sharedString) {
			this.updateInputFromSharedString();
		}
	}

	public render() {
		return (
			// There are a lot of different ways content can be inserted into a input box
			// and not all of them trigger a onBeforeInput event. To ensure we are grabbing
			// the correct selection before we modify the shared string we need to make sure
			// this.updateSelection is being called for multiple cases.
			<input
				className={this.props.className}
				style={this.props.style}
				readOnly={this.props.readOnly ?? false}
				spellCheck={this.props.spellCheck ?? true}
				ref={this.inputElementRef}
				disabled={this.props.disabled}
				onBeforeInput={this.updateSelection}
				onKeyDown={this.updateSelection}
				onClick={this.updateSelection}
				onContextMenu={this.updateSelection}
				onInput={this.handleInput}
			/>
		);
	}

	private updateInputFromSharedString() {
		const text = this.props.sharedString.getText();
		if (this.inputElementRef.current && this.inputElementRef.current.value !== text) {
			this.inputElementRef.current.value = text;
		}
	}

	private readonly handleInput = (ev: React.FormEvent<HTMLInputElement>) => {
		// We need to set the value here to keep the input responsive to the user
		const newText = ev.currentTarget.value;

		// Get the new caret position and use that to get the text that was inserted
		const newPosition = ev.currentTarget.selectionStart ?? 0;
		const isTextInserted = newPosition - this.state.selectionStart > 0;
		if (isTextInserted) {
			const insertedText = newText.substring(this.state.selectionStart, newPosition);
			const changeRangeLength = this.state.selectionEnd - this.state.selectionStart;
			if (changeRangeLength === 0) {
				this.props.sharedString.insertText(this.state.selectionStart, insertedText);
			} else {
				this.props.sharedString.replaceText(
					this.state.selectionStart,
					this.state.selectionEnd,
					insertedText,
				);
			}
		} else {
			this.props.sharedString.removeText(newPosition, this.state.selectionEnd);
		}
		this.props.onInput?.(this.props.sharedString);
	};

	/**
	 * Update the current caret selection.
	 * We need to do this before we do any handleInput action or we will have lost our
	 * cursor position and not be able to accurately update the shared string.
	 */
	private readonly updateSelection = () => {
		if (!this.inputElementRef.current) {
			return;
		}

		const selectionEnd = this.inputElementRef.current.selectionEnd ?? 0;
		const selectionStart = this.inputElementRef.current.selectionStart ?? 0;
		this.setState({ selectionEnd, selectionStart });
	};
}
