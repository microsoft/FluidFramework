/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Input, InputOnChangeData } from "@fluentui/react-components";
import { EditType, FluidObjectValueNode, SendEditData } from "@fluid-experimental/devtools-core";
import { useMessageRelay } from "../../MessageRelayContext";

/**
 * Input to {@link EditableValueView}
 */
export interface EditableValueViewProps {
	node: FluidObjectValueNode;
	containerKey: string;
}

/**
 * Constructs a editable text field to allow editing of a DDS' content.
 */
export function EditableValueView(props: EditableValueViewProps): React.ReactElement {
	const { node, containerKey } = props;
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
	 * isTextBox is whether or not the area should allow text or numbers only.
	 */
	const [isTextBox, setIsTextBox] = React.useState<boolean>(
		node.typeMetadata === "number" || node.typeMetadata === "SharedCounter" ? false : true,
	);
	console.log(setIsTextBox);
	const textAreaRef = React.useRef<HTMLInputElement>(null);

	const backgroundUpdate = (): void => {
		if (isEditing === false) {
			setValue(String(node.value));
		}
	};
	React.useEffect(backgroundUpdate, [node.value, isEditing]);

	const onFocus = React.useCallback(() => {
		if (textAreaRef.current !== null) {
			textAreaRef.current?.select();
		}

		setIsEditing(true);
	}, []);

	const onChange = React.useCallback(
		(_ev: React.ChangeEvent<HTMLInputElement>, data: InputOnChangeData) => {
			setValue(data.value);
		},
		[],
	);

	const onBlur = React.useCallback(() => {
		setValue(String(node.value));
		setIsEditing(false);
	}, [node.value]);

	const commitChanges = React.useCallback(() => {
		messageRelay.postMessage(
			SendEditData.createMessage({
				containerKey,
				fluidObjectId: node.fluidObjectId,
				newData: value,
				editType: EditType.string,
			}),
		);
	}, [containerKey, messageRelay, node.fluidObjectId, value]);

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

	return (
		<Input
			size="small"
			appearance="underline"
			contentEditable
			ref={textAreaRef}
			onClick={(event): void => event.preventDefault()}
			value={value}
			onChange={onChange}
			onFocus={onFocus}
			onBlur={onBlur}
			onKeyDown={onKeyDown}
			type={isTextBox ? "text" : "number"}
		/>
	);
}
