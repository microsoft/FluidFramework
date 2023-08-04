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
import { DataEdit, FluidObjectValueNode, Primitive } from "@fluid-experimental/devtools-core";

import { Serializable } from "@fluidframework/datastore-definitions";
import { useMessageRelay } from "../../MessageRelayContext";
import { TreeHeader } from "./TreeHeader";

/**
 * Input to {@link EditableValueView}
 */
export interface EditableViewProps {
	node: FluidObjectValueNode;
	containerKey: string;
	label: string;
}

/**
 * Render data that is Editable with its corresponding UI
 *
 * @remarks {@link ContainerFeaturesContext} must be set in order to use this component.
 */
export function EditableView(props: EditableViewProps): React.ReactElement {
	const { node, containerKey, label } = props;

	/**
	 * State to store whether the user is currently editing data
	 */
	const [editing, setEditing] = React.useState<boolean>(false);

	/**
	 * State to store the current type, or the type of the intended edit
	 */
	const [type, setType] = React.useState<string>(typeof node.value);

	/**
	 * State to store the corresponding UI component
	 */
	const [editingComponent, setEditingComponent] = React.useState<React.ReactElement>(<></>);

	const messageRelay = useMessageRelay();

	/**
	 * On blur will set {@link editing} to false
	 */
	const onBlur = React.useCallback((event: React.FocusEvent<HTMLDivElement>) => {
		/**
		 * This allows the parent element to share focus with children
		 * so the blur event only triggers if focus is outside of div and children
		 */
		if (!event.currentTarget.contains(event.relatedTarget)) {
			setEditing(false);
		}
	}, []);

	/**
	 * Updates {@link editing} state to true on focus
	 */
	const onFocus = React.useCallback(() => {
		setEditing(true);
	}, []);

	/**
	 * Using the {@link fluidObjectId}, {@link containerKey}, and data posts a message to edit the DDS
	 * @param data - The data to edit the DDS with
	 */
	const submitChange = React.useCallback(
		(data: Serializable<unknown> | Primitive): void => {
			setEditing(false);
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
						<EditableTextComponent
							node={node}
							setEditing={setEditing}
							submitChange={submitChange}
						/>
					);
					break;
				case "number":
					component = (
						<EditableNumberComponent
							node={node}
							setEditing={setEditing}
							submitChange={submitChange}
						/>
					);
					break;
				case "boolean":
					component = (
						<EditableBooleanComponent node={node} submitChange={submitChange} />
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
	 * Background updates to keep the UI in sync with the data
	 */
	React.useEffect(() => {
		if (editing === false) {
			setType(typeof node.value);
			// setLocalData(node.value);
			setEditingComponent(selectEditUI(typeof node.value));
		}
	}, [node.value, editing, selectEditUI]);

	/**
	 * Updates {@link "type"} and {@link editingComponent} based on the option selected from the dropdown
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

	const options = node.editProps?.editTypes;
	return options === undefined ? (
		<TreeHeader
			label={label}
			nodeTypeMetadata={node.typeMetadata}
			inlineValue={String(node.value)}
		/>
	) : (
		<div
			style={
				editing
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
 * Input to {@link EditBooleanComponent}
 */
interface EditableBooleanComponentProps {
	node: FluidObjectValueNode;
	submitChange: (data: Serializable<unknown> | Primitive) => void;
}

/**
 * Component which allows for boolean editing
 */
function EditableBooleanComponent(props: EditableBooleanComponentProps): React.ReactElement {
	const { node, submitChange } = props;

	/**
	 * Auxiliary function to make boolean editing buttons
	 * @param isTrue - Determines if it should be a true or false button
	 * @returns - 2 buttons, one for setting value to false and one for true
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
 * Input to {@link EditTextComponent}
 */
interface EditableTextComponentProps {
	node: FluidObjectValueNode;
	setEditing: React.Dispatch<React.SetStateAction<boolean>>;
	submitChange: (data: Serializable<unknown> | Primitive) => void;
}

/**
 * Component which allows for text editing
 */
function EditableTextComponent(props: EditableTextComponentProps): React.ReactElement {
	const { node, setEditing, submitChange } = props;
	const [localData, setLocalData] = React.useState<string>(
		typeof node.value !== "string" ? "" : node.value,
	);

	/**
	 * Provides comfirming and canceling an edit functionality
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (key === "Enter") {
				event.currentTarget.blur();
				submitChange(localData);
			}

			if (key === "Escape") {
				event.currentTarget.blur();
			}
		},
		[localData, submitChange],
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
		<>
			<Input
				size="small"
				appearance="underline"
				contentEditable={true}
				value={localData}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				onChange={onChange}
				type="text"
			/>
		</>
	);
}

/**
 * Input to {@link EditTextComponent}
 */
interface EditableNumberComponentProps {
	node: FluidObjectValueNode;
	setEditing: React.Dispatch<React.SetStateAction<boolean>>;
	submitChange: (data: Serializable<unknown> | Primitive) => void;
}

/**
 * Component which allows for number editing
 */
function EditableNumberComponent(props: EditableNumberComponentProps): React.ReactElement {
	const { node, setEditing, submitChange } = props;
	const [localData, setLocalData] = React.useState<string>(
		typeof node.value !== "number" ? "0" : String(node.value),
	);

	/**
	 * Provides comfirming and canceling an edit functionality
	 */
	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;

			if (key === "Enter") {
				event.currentTarget.blur();
				submitChange(Number(localData));
			}

			if (key === "Escape") {
				event.currentTarget.blur();
			}
		},
		[localData, submitChange],
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
		<>
			<Input
				size="small"
				appearance="underline"
				contentEditable={true}
				value={localData}
				onFocus={onFocus}
				onKeyDown={onKeyDown}
				onChange={onChange}
				type="number"
			/>
		</>
	);
}
