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
import { DataEdit, EditType, FluidObjectValueNode } from "@fluid-experimental/devtools-core";

import { Serializable } from "@fluidframework/datastore-definitions";
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
	setEditing: React.Dispatch<React.SetStateAction<boolean>>;
	// eslint-disable-next-line @rushstack/no-new-null
	submitChange: (data: Serializable<unknown> | null | undefined) => void;
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
	const [type, setType] = React.useState<string>(typeof node.value);

	const messageRelay = useMessageRelay();

	/**
	 * Using the {@link fluidObjectId}, {@link containerKey}, and data posts a message to edit the DDS
	 * @param data - The data to edit the DDS with
	 */
	const submitChange = React.useCallback(
		(data: Serializable<unknown> | null | undefined): void => {
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
	 * Determines the Editing UI based on the {@link "type"}
	 */
	const selectEditUI = React.useCallback(
		(typeParamater: string): React.ReactElement => {
			let component: React.ReactElement = <></>;
			switch (typeParamater) {
				case "string":
					component = (
						<EditableInputComponent
							node={node}
							setEditing={setIsEditing}
							submitChange={submitChange}
							inputType={"string"}
						/>
					);
					break;
				case "number":
					component = (
						<EditableInputComponent
							node={node}
							setEditing={setIsEditing}
							submitChange={submitChange}
							inputType={"number"}
						/>
					);
					break;
				case "boolean":
					component = (
						<EditableBooleanComponent
							node={node}
							submitChange={submitChange}
							setEditing={setIsEditing}
						/>
					);
					break;
				case "undefined":
					break;

				case "null":
					break;

				default:
			}

			return component;
		},
		[node, submitChange],
	);

	/**
	 * State to store the corresponding UI component
	 */
	const [editingComponent, setEditingComponent] = React.useState<React.ReactElement>(
		selectEditUI(type),
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
			setType(typeof node.value);
			setEditingComponent(selectEditUI(typeof node.value));
		}
	}, [node.value, isEditing, selectEditUI]);

	/**
	 * Updates {@link "type"} and {@link editingComponent} based on the option selected from the dropdown
	 * If the option selected is null or undefined it will automaticlly send the message to change its value
	 * and will only display the dropdown with either "null" or "undefined"
	 * @param data - The option selected from the dropdown
	 */
	const onOptionSelect: DropdownProps["onOptionSelect"] = (event, data) => {
		setType(data.optionText ?? "undefined");
		setEditingComponent(selectEditUI(data.optionText ?? "undefined"));
		if (data.optionText === "undefined") {
			submitChange(undefined);
		}

		if (data.optionText === " null") {
			// We need to support users waiting to use "null" as a value
			// eslint-disable-next-line unicorn/no-null
			submitChange(null);
		}
	};

	const options = node.editProps?.editTypes === undefined ? allEdits : node.editProps?.editTypes;

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
				value={type}
				selectedOptions={[type]}
			>
				{options.map((option) => (
					<Option key={option}>{option}</Option>
				))}
			</Dropdown>
			{editingComponent}
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
	const { node, setEditing, submitChange, inputType } = props;

	// Clearning out data if it was not already a number
	const [localData, setLocalData] = React.useState<string>(
		typeof node.value !== inputType ? "" : String(node.value),
	);

	/**
	 * Provides comfirming and canceling an edit functionality
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
	 * Sets the local data to what the user wrote in the component
	 */
	function onChange(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData): void {
		setLocalData(data.value);
	}

	/**
	 * Sets {@link editing} to false when the compoenent is focused
	 */
	const onFocus = React.useCallback(() => {
		setEditing(true);
	}, [setEditing]);

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
