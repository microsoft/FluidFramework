/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import {
	Button,
	Dropdown,
	DropdownProps,
	Input,
	InputOnChangeData,
	Option,
	tokens,
} from "@fluentui/react-components";
import {
	DataEdit,
	EditData,
	EditType,
	FluidObjectValueNode,
	Primitive,
} from "@fluid-experimental/devtools-core";

import { useMessageRelay } from "../../MessageRelayContext";
import { TreeHeader } from "./TreeHeader";

/**
 * Input to {@link EditableView}
 */
export interface EditableViewProps {
	node: FluidObjectValueNode;
	containerKey: string;
	label: string;
}

/**
 * Input to EditableComponents
 */
interface EditableComponentProps {
	node: FluidObjectValueNode;
	setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
	submitChange: (data: EditData) => void;
}

/**
 * Render data that is Editable with its corresponding UI
 *
 * @remarks {@link MessageRelayContext} must be set in order to use this component.
 */
export function EditableView(props: EditableViewProps): React.ReactElement {
	const { node, containerKey, label } = props;

	/**
	 * State to store whether the user is currently editing data
	 */
	const [isEditing, setIsEditing] = React.useState<boolean>(false);

	/**
	 * State to store the current type, or the type of the intended edit
	 */
	const [editType, setEditType] = React.useState<string>(typeOfNodeValue(node.value));

	const messageRelay = useMessageRelay();

	/**
	 * Using the {@link fluidObjectId}, {@link containerKey}, and data posts a message to edit the DDS
	 * @param data - The data to edit the DDS with
	 */
	const submitChange = React.useCallback(
		(data: EditData): void => {
			setIsEditing(false);
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
		},
		[containerKey, messageRelay, node.fluidObjectId],
	);

	/**
	 * On blur will set {@link isEditing} to false
	 * Blurring should occur when the user discards an edit (Componenet specific)
	 * or focuses something not part of the editing experience of that node
	 */
	function onBlur(event: React.FocusEvent<HTMLDivElement>): void {
		/**
		 * This allows the parent element to share focus with children
		 * so the blur event only triggers if focus is outside of div and children
		 */
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setIsEditing(false);
		}
	}

	/**
	 * Updates {@link isEditing} state to true on focus
	 */
	function onFocus(): void {
		setIsEditing(true);
	}

	/**
	 * Background updates to keep the UI in sync with the data
	 */
	React.useEffect(() => {
		if (isEditing === false) {
			setEditType(typeOfNodeValue(node.value));
		}
	}, [node.value, isEditing]);

	/**
	 * Updates {@link editType} and {@link editingComponent} based on the option selected from the dropdown
	 * If the option selected is null or undefined it will automaticlly send the message to change its value
	 * and will only display the dropdown with either "null" or "undefined"
	 * @param data - The option selected from the dropdown
	 */
	const onOptionSelect: DropdownProps["onOptionSelect"] = (event, data) => {
		if (data.optionText === undefined) {
			throw new Error("Invalid option text from dropdown");
		}

		setEditType(data.optionText);
		if (data.optionText === "undefined") {
			submitChange(undefined);
		}

		if (data.optionText === "null") {
			// We need to support users waiting to use "null" as a value
			// eslint-disable-next-line unicorn/no-null
			submitChange(null);
		}
	};

	/**
	 * Return the correct type of the node. Includes special case for null since "typeof null === object"
	 */
	function typeOfNodeValue(nodeValue: Primitive): string {
		return nodeValue === null ? "null" : typeof nodeValue;
	}

	const options = node.editProps?.editTypes === undefined ? allEdits : node.editProps?.editTypes;

	let innerView: React.ReactElement;
	switch (editType) {
		case "string":
			innerView = (
				<EditableInputComponent
					node={node}
					setIsEditing={setIsEditing}
					isEditing={isEditing}
					submitChange={submitChange}
					inputType={"string"}
				/>
			);
			break;
		case "number":
			innerView = (
				<EditableInputComponent
					node={node}
					setIsEditing={setIsEditing}
					isEditing={isEditing}
					submitChange={submitChange}
					inputType={"number"}
				/>
			);
			break;
		case "boolean":
			innerView = (
				<EditableBooleanComponent
					node={node}
					submitChange={submitChange}
					setIsEditing={setIsEditing}
				/>
			);
			break;
		case "undefined":
			innerView = <i>: undefined</i>;
			break;

		case "null":
			innerView = <i>: null</i>;
			break;

		default:
			throw new Error("Unrecognized edit type.");
	}

	return (
		<div
			style={
				isEditing
					? {
							border: "2px solid",
							borderColor: tokens.colorBrandStroke1,
							display: "flex",
					  }
					: { display: "flex" }
			}
			onBlur={onBlur}
			onFocus={onFocus}
			onClick={(event): void => event?.preventDefault()}
		>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} />
			<Dropdown
				size="small"
				style={{ minWidth: "10px" }}
				onOptionSelect={onOptionSelect}
				value={editType}
				selectedOptions={[editType]}
			>
				{options.map((option) => (
					<Option key={option}>{option}</Option>
				))}
			</Dropdown>
			{innerView}
		</div>
	);
}

/**
 * Component which allows for boolean editing
 */
function EditableBooleanComponent(props: EditableComponentProps): React.ReactElement {
	const { node, submitChange } = props;

	/**
	 * Auxiliary function to make boolean editing buttons
	 * @param isTrue - Determines if it should be a true or false button
	 * @returns 2 buttons, one for setting value to false and one for true
	 */
	function boolButton(isTrue: boolean): React.ReactElement {
		return (
			<Button
				size="small"
				disabled={isTrue === node.value}
				onClick={(event): void => {
					event.preventDefault();
					event.stopPropagation();
					submitChange(isTrue);
				}}
			>
				{String(isTrue).charAt(0).toUpperCase() + String(isTrue).slice(1)}
			</Button>
		);
	}
	return (
		<>
			{boolButton(true)}
			{boolButton(false)}
		</>
	);
}

/**
 * Input for {@link EditableInputComponent}
 */
interface EditableInputComponent extends EditableComponentProps {
	inputType: "string" | "number";
	isEditing: boolean;
}

/**
 * Component which allows for number editing
 */
function EditableInputComponent(props: EditableInputComponent): React.ReactElement {
	const { node, setIsEditing, submitChange, inputType, isEditing } = props;

	// Clearing out data if it was not already a number
	const [localData, setLocalData] = React.useState<string>("");

	/**
	 * Provides confirming and canceling an edit functionality
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (key === "Enter") {
				event.currentTarget.blur();
				submitChange(inputType === "string" ? localData : Number(localData));
			}

			if (key === "Escape") {
				event.currentTarget.blur();
			}
		},
		[inputType, localData, submitChange],
	);

	/**
	 * Background updates to keep the UI in sync with the data
	 */
	React.useEffect(() => {
		if (isEditing === false) {
			setLocalData(String(node.value));
		}
	}, [node.value, isEditing]);

	/**
	 * Sets the local data to what the user wrote in the component
	 */
	function onChange(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData): void {
		setLocalData(data.value);
	}

	/**
	 * Sets {@link isEditing} to false when the component is focused
	 */
	const onFocus = React.useCallback(() => {
		setIsEditing(true);
	}, [setIsEditing]);

	return (
		<Input
			size="small"
			appearance="underline"
			contentEditable={true}
			value={localData}
			onFocus={onFocus}
			onKeyDown={onKeyDown}
			onChange={onChange}
			type={inputType === "string" ? "text" : "number"}
		/>
	);
}

const allEdits = [
	EditType.Boolean,
	EditType.String,
	EditType.Number,
	EditType.Null,
	EditType.Undefined,
];
