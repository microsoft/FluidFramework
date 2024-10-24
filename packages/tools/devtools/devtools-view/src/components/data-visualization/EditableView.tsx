/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	Button,
	Dropdown,
	type DropdownProps,
	Input,
	type InputOnChangeData,
	Option,
	makeStyles,
	shorthands,
	tokens,
} from "@fluentui/react-components";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import {
	DataEdit,
	type EditData,
	EditType,
	type FluidObjectValueNode,
	type HasContainerKey,
} from "@fluidframework/devtools-core/internal";
import React from "react";

import { useMessageRelay } from "../../MessageRelayContext.js";

import type { HasLabel } from "./CommonInterfaces.js";
import { TreeHeader } from "./TreeHeader.js";

/**
 * Input to {@link EditableView}
 */
export interface EditableViewProps extends HasLabel, HasContainerKey {
	node: FluidObjectValueNode;
}

/**
 * Input to EditableComponents
 */
interface EditableComponentProps {
	node: FluidObjectValueNode;
	activeEdit: EditState | undefined;
	setActiveEdit: React.Dispatch<React.SetStateAction<EditState | undefined>>;
	submitChange: (data: EditData) => void;
}

/**
 * EditState describes the current state of editing
 */
interface EditState {
	/**
	 * The type of data the user will edit with
	 */
	type: string;

	/**
	 * If value is undefined it means that the value has not been assigned yet
	 */
	value?: Serializable<unknown>;
}

/**
 * Render data that is Editable with its corresponding UI
 * @remarks {@link MessageRelayContext} must be set in order to use this component.
 */
export function EditableView(props: EditableViewProps): React.ReactElement {
	const { node, containerKey, label } = props;

	// If activeEdit is undefined then it means that there is not edit currently being made. Ths means the data will update with node.value directly
	const [activeEdit, setActiveEdit] = React.useState<EditState | undefined>(undefined);

	const messageRelay = useMessageRelay();

	/**
	 * Using the {@link fluidObjectId}, {@link containerKey}, and data posts a message to edit the DDS
	 * This will also "cancel" the edit after it is submitted as a clean up procedure
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
			setActiveEdit(undefined);
		},
		[containerKey, messageRelay, node.fluidObjectId],
	);

	/**
	 * On blur will set {@link activeEdit} to undefined which cancels the edit
	 * This generally occurs when the users focuses something not within the compoenent
	 */
	function onBlur(event: React.FocusEvent<HTMLDivElement>): void {
		/**
		 * This allows the parent element to share focus with children
		 * so the blur event only triggers if focus is outside of div and children
		 */
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setActiveEdit(undefined);
		}
	}

	/**
	 * Updates {@link activeEdit."type"} based on the option selected from the dropdown
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
			return;
		}

		if (data.optionText === "null") {
			// We need to support users waiting to use "null" as a value
			// eslint-disable-next-line unicorn/no-null
			submitChange(null);
			return;
		}

		// This checks if the selected option was the current option, if so it the value stays the same. If not then it clears it.
		let newValue: Serializable<unknown> | undefined;
		if (activeEdit === undefined) {
			newValue = data.optionText === typeof node.value ? (node.value ?? undefined) : "";
		} else {
			newValue = data.optionText === activeEdit.type ? activeEdit.value : "";
		}
		setActiveEdit({
			type: data.optionText,
			value: newValue,
		});
	};

	const options =
		node.editProps?.editTypes === undefined ? allEdits : node.editProps?.editTypes;

	// Returns the proper type, mainly fixing te issue of null being type "object"
	function getEditType(): string {
		if (activeEdit === undefined) {
			return node.value === null ? "null" : typeof node.value;
		} else {
			return activeEdit.value === null ? "null" : activeEdit.type;
		}
	}

	// Determines the editing component to append to the UI
	let innerView: React.ReactElement;
	switch (getEditType()) {
		case "string": {
			innerView = (
				<EditableInputComponent
					node={node}
					activeEdit={activeEdit}
					setActiveEdit={setActiveEdit}
					submitChange={submitChange}
					inputType={"string"}
				/>
			);
			break;
		}
		case "number": {
			innerView = (
				<EditableInputComponent
					node={node}
					activeEdit={activeEdit}
					setActiveEdit={setActiveEdit}
					submitChange={submitChange}
					inputType={"number"}
				/>
			);
			break;
		}
		case "boolean": {
			innerView = (
				<EditableBooleanComponent
					node={node}
					setActiveEdit={setActiveEdit}
					activeEdit={activeEdit}
					submitChange={submitChange}
				/>
			);
			break;
		}
		case "undefined": {
			innerView = <i>: undefined</i>;
			break;
		}

		case "null": {
			innerView = <i>: null</i>;
			break;
		}

		default: {
			throw new Error("Unrecognized edit type.");
		}
	}

	const styles = useStyles();

	return (
		<div
			className={activeEdit === undefined ? styles.isNotEditingStyle : styles.isEditingStyle}
			onBlur={onBlur}
			onClick={(event): void => event?.preventDefault()}
		>
			<TreeHeader label={label} nodeTypeMetadata={node.typeMetadata} />
			<Dropdown
				size="small"
				className={styles.dropdownStyle}
				onOptionSelect={onOptionSelect}
				value={
					activeEdit === undefined
						? node.value === null
							? "null"
							: typeof node.value
						: activeEdit.type
				}
				selectedOptions={[
					activeEdit === undefined
						? node.value === null
							? "null"
							: typeof node.value
						: activeEdit.type,
				]}
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
	const { node, submitChange, inputType, activeEdit, setActiveEdit } = props;

	/**
	 * Provides confirming and canceling an edit functionality
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (activeEdit === undefined) {
				return;
			}
			if (key === "Enter") {
				submitChange(
					activeEdit.type === "number" ? Number(activeEdit.value) : activeEdit.value,
				);
			}

			if (key === "Escape") {
				setActiveEdit(undefined);
			}
		},
		[activeEdit, setActiveEdit, submitChange],
	);

	/**
	 * Sets the local data to what the user wrote in the component
	 */
	function onChange(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData): void {
		setActiveEdit({
			type: activeEdit === undefined ? typeof node.value : activeEdit.type,
			value: data.value,
		});
	}

	return (
		<Input
			size="small"
			appearance="underline"
			contentEditable={true}
			value={activeEdit === undefined ? (node.value as string) : (activeEdit.value as string)}
			onKeyDown={onKeyDown}
			onChange={onChange}
			type={inputType === "string" ? "text" : "number"}
		/>
	);
}

/**
 * The list of all edit types supported by the view
 */
const allEdits = [
	EditType.Boolean,
	EditType.String,
	EditType.Number,
	EditType.Undefined,
	EditType.Null,
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
