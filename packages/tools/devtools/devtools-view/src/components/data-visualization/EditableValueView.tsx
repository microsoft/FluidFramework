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
	 * Converts editType to the Input form type.
	 *
	 * @remarks Will return `undefined` if the input edit type is not one the system knows about.
	 */
	function editTypeToInputType(): "number" | "text" | undefined {
		switch (editType) {
			case "number":
				return "number";
			case "string":
				return "text";
			default:
				console.warn(`Unrecognized editType value "${editType}".`);
				return undefined;
		}
	}

	const inputType = editTypeToInputType();
	if (inputType === undefined) {
		// If the edit type is not one we recognize, do not allow (unsafe) editing.
		return (
			<TreeHeader
				label={label}
				nodeTypeMetadata={node.typeMetadata}
				inlineValue={String(node.value)}
			/>
		);
	}

	return (
		<>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata}></TreeHeader>
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
				type={inputType}
			/>
		</>
	);
}
