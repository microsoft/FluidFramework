/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Input, InputOnChangeData } from "@fluentui/react-components";
import { FluidObjectValueNode, DataEdit } from "@fluid-experimental/devtools-core";
import { Serializable } from "@fluidframework/datastore-definitions";
import { useMessageRelay } from "../../MessageRelayContext";
import { TreeHeader } from "./TreeHeader";

/**
 * Input to {@link EditableValueView}
 */
export interface EditableValueViewProps {
	node: FluidObjectValueNode;
	containerKey: string;
	label: string;
}

/**
 * Constructs a editable text field to allow editing of a DDS' content.
 */
export function EditableValueView(props: EditableValueViewProps): React.ReactElement {
	const { node, containerKey, label } = props;
	const messageRelay = useMessageRelay();

	/**
	 * value is the current value of the text field.
	 */
	const [value, setValue] = React.useState<string>(String(node.value));

	/**
	 * isEditing is whether or not the user is currently attempting to edit a value. If they are it will not update so their changes are not overwritten
	 */
	const [isEditing, setIsEditing] = React.useState<boolean>(false);

	/**
	 * isType declares what type the edit will be
	 */
	const [editType, setEditType] = React.useState<string>(typeof node.value);

	const textAreaRef = React.useRef<HTMLInputElement>(null);

	/**
	 * Keep the value in the input area up to date with the value of the node value as long as the user is not currently editing
	 */
	React.useEffect(() => {
		if (isEditing === false) {
			setValue(String(node.value));
			setEditType(typeof node.value);
		}
	}, [node.value, isEditing]);

	/**
	 * When starting to edit will select all of the text currently in the box
	 */
	const onFocus = React.useCallback(() => {
		if (textAreaRef.current !== null) {
			textAreaRef.current?.select();
		}

		setIsEditing(true);
	}, []);

	/**
	 * Updates the value state with the user input while editing
	 */
	const onChange = React.useCallback(
		(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
			setValue(data.value);
		},
		[],
	);

	/**
	 * When the field is "blur-ed" it reverts any changes to the field back to the
	 * value of the node and sets state to not editing
	 */
	const onBlur = React.useCallback(() => {
		setValue(String(node.value));
		setIsEditing(false);
	}, [node.value]);

	/**
	 * When changes are "commited" it will parse the data for the desired type {@link editType}.
	 * Then it will post an edit message
	 */
	const commitChanges = React.useCallback(() => {
		let data: Serializable<unknown> = value;
		switch (editType) {
			case "number":
				data = Number(value);
				break;
			case "boolean":
				data = value === "true" ? true : false;
				break;
			default:
				data = String(value);
				break;
		}
		const edit = {
			fluidObjectId: node.fluidObjectId,
			data,
		};
		messageRelay.postMessage(
			DataEdit.createMessage({
				containerKey,
				edit,
			}),
		);
	}, [containerKey, editType, messageRelay, node.fluidObjectId, value]);

	/**
	 * Listens on keydown to be able to both escape and commit
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (key === "Enter") {
				commitChanges();
				event.currentTarget.blur();
			}

			if (key === "Escape") {
				event.currentTarget.blur();
			}
		},
		[commitChanges],
	);

	/**
	 * Input field for editing
	 * @param textBox - whether the input field should be of type "number" or "text"
	 * @returns - React.ReactEllment which is an input field with the desired properites for editing
	 */
	function inputEdit(textBox: boolean): React.ReactElement {
		return (
			<Input
				size="small"
				appearance="underline"
				contentEditable
				ref={textAreaRef}
				// Prevent default prevents a bug where clicking on the field casues it to blur unexpectedly
				onClick={(event): void => event.preventDefault()}
				value={String(value)}
				onChange={onChange}
				onFocus={onFocus}
				onBlur={onBlur}
				onKeyDown={onKeyDown}
				type={textBox ? "text" : "number"}
			/>
		);
	}

	/**
	 * Converts editType to the corresponding UI
	 * @returns React.ReactElement which matches the desired editing type to the corresponding UI
	 */
	function editTypeToEditUi(): React.ReactElement {
		switch (editType) {
			case "number":
				return inputEdit(false);
				break;
			case "string":
				return inputEdit(true);
				break;
			default:
				return <span>{String(node.value)}</span>;
				throw new Error("TODO");
		}
	}

	return (
		<>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata}></TreeHeader>
			{editTypeToEditUi()}
		</>
	);
}
