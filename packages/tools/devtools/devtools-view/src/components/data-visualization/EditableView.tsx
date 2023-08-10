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
	makeStyles,
	shorthands,
	tokens,
} from "@fluentui/react-components";
import {
	DataEdit,
	EditData,
	EditType,
	FluidObjectValueNode,
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
	editProp: EditState | undefined;
	setEditProp: React.Dispatch<React.SetStateAction<EditState | undefined>>;
	submitChange: (data: EditData) => void;
}

interface EditState {
	type: string;
	value?: EditData;
}
/**
 * Render data that is Editable with its corresponding UI
 *
 * @remarks {@link MessageRelayContext} must be set in order to use this component.
 */
export function EditableView(props: EditableViewProps): React.ReactElement {
	const { node, containerKey, label } = props;

	const [editProp, setEditProp] = React.useState<EditState | undefined>(undefined);

	const messageRelay = useMessageRelay();

	/**
	 * Using the {@link fluidObjectId}, {@link containerKey}, and data posts a message to edit the DDS
	 * @param data - The data to edit the DDS with
	 */
	const submitChange = React.useCallback(
		(data: EditData): void => {
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
			setEditProp(undefined);
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
			setEditProp(undefined);
		}
	}

	/**
	 * Updates {@link editType} and {@link editingComponent} based on the option selected from the dropdown
	 * If the option selected is null or undefined it will automatically send the message to change its value
	 * and will only display the dropdown with either "null" or "undefined"
	 * @param data - The option selected from the dropdown
	 */
	const onOptionSelect: DropdownProps["onOptionSelect"] = (event, data) => {
		if (data.optionText === undefined) {
			throw new Error("Invalid option text from dropdown");
		}

		if (data.optionText === "undefined") {
			submitChange(undefined);
		}

		if (data.optionText === "null") {
			// We need to support users waiting to use "null" as a value
			// eslint-disable-next-line unicorn/no-null
			submitChange(null);
		}

		let newValue: EditData;
		if (editProp !== undefined) {
			newValue = data.optionText === editProp.type ? editProp.value : "";
		} else {
			newValue = data.optionText === typeof node.value ? node.value : "";
		}
		setEditProp({
			type: data.optionText,
			value: newValue,
		});
	};

	const options = node.editProps?.editTypes === undefined ? allEdits : node.editProps?.editTypes;

	let innerView: React.ReactElement;
	switch (editProp === undefined ? typeof node.value : editProp.type) {
		case "string":
			innerView = (
				<EditableInputComponent
					node={node}
					editProp={editProp}
					setEditProp={setEditProp}
					submitChange={submitChange}
					inputType={"string"}
				/>
			);
			break;
		case "number":
			innerView = (
				<EditableInputComponent
					node={node}
					editProp={editProp}
					setEditProp={setEditProp}
					submitChange={submitChange}
					inputType={"number"}
				/>
			);
			break;
		case "boolean":
			innerView = (
				<EditableBooleanComponent
					node={node}
					setEditProp={setEditProp}
					editProp={editProp}
					submitChange={submitChange}
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

	const styles = useStyles();

	return (
		<div
			className={editProp !== undefined ? styles.isEditingStyle : styles.isNotEditingStyle}
			onBlur={onBlur}
			onClick={(event): void => event?.preventDefault()}
		>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} />
			<Dropdown
				size="small"
				className={styles.dropdownStyle}
				onOptionSelect={onOptionSelect}
				value={editProp === undefined ? typeof node.value : editProp.type}
				selectedOptions={[editProp === undefined ? typeof node.value : editProp.type]}
			>
				{options.map((option) => (
					<Option
						onMouseDownCapture={(event): void => {
							event.preventDefault();
						}}
						key={option}
					>
						{option}
					</Option>
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
}

/**
 * Component which allows for number editing
 */
function EditableInputComponent(props: EditableInputComponent): React.ReactElement {
	const { node, submitChange, inputType, editProp, setEditProp } = props;

	/**
	 * Provides confirming and canceling an edit functionality
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (editProp === undefined) {
				return;
			}
			if (key === "Enter") {
				submitChange(editProp.type === "number" ? Number(editProp.value) : editProp.value);
				event.currentTarget.blur();
			}

			if (key === "Escape") {
				event.currentTarget.blur();
			}
		},
		[editProp, submitChange],
	);

	/**
	 * Sets the local data to what the user wrote in the component
	 */
	function onChange(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData): void {
		setEditProp({
			type: editProp === undefined ? typeof node.value : editProp.type,
			value: data.value,
		});
	}

	return (
		<Input
			size="small"
			appearance="underline"
			contentEditable={true}
			value={editProp !== undefined ? (editProp.value as string) : (node.value as string)}
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

/**
 * Styles for the editing components
 */
const useStyles = makeStyles({
	/**
	 * Outline when editing
	 */
	isEditingStyle: {
		...shorthands.border("2px", "solid", tokens.colorBrandStroke1),
		display: "flex",
	},

	/**
	 * Standard visual when not editing
	 */
	isNotEditingStyle: {
		display: "flex",
	},

	/**
	 * Dropdown menu
	 */
	dropdownStyle: {
		minWidth: "10px",
	},
});
