/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Dropdown, Input, InputOnChangeData, Option, tokens } from "@fluentui/react-components";
import { EditType, FluidObjectValueNode, SendEditData } from "@fluid-experimental/devtools-core";
import { useMessageRelay } from "../../MessageRelayContext";
/**
 * Input to {@link TreeItem}
 */
export interface EditableValueViewProps {
	node: FluidObjectValueNode;
	containerKey: string;
}

/**
 * Constructs a tree element from the provided header and child contents.
 *
 * Intended to be used inside an outer {@link @fluentui/react-components/unstable#Tree} context.
 */
export function EditableValueView(props: EditableValueViewProps): React.ReactElement {
	const { node, containerKey } = props;
	const messageRelay = useMessageRelay();

	const [value, setValue] = React.useState<string>(String(node.value));
	const [isEditing, setIsEditing] = React.useState<boolean>(false);
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

	const onKeyDown = React.useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const key = event.key;
			function commitChanges(): void {
				messageRelay.postMessage(
					SendEditData.createMessage({
						containerKey,
						fluidObjectId: node.fluidObjectId,
						newData: value,
						editType: [EditType.string],
					}),
				);
			}
			if (key === "Enter") {
				commitChanges();
				event.currentTarget.blur();
			}
			console.log(key);
		},
		[containerKey, messageRelay, node.fluidObjectId, value],
	);

	const dropdownStyle = {
		fontSize: "10px",
		color: "red",
		minWidth: "30px",
	};

	// if (node.editProps === undefined) {
	// 	return <></>;
	// }

	return (
		<>
			{/* {node.editProps.editTypes} */}
			{(node.editProps?.editTypes) ? "hello" : node.editProps?.editTypes ? "test" : "nope"
} 
			{/* {node.editProps.editTypes.length > 0 ? "hello" : "test"} */}
			<div>
				<Dropdown
					style={dropdownStyle}
					size="small"
					defaultValue={node.typeMetadata === undefined ? "" : ` (${node.typeMetadata})`}
					onClick={(event): void => event.preventDefault()}
					appearance="underline"
					color={tokens.colorPaletteRedBorderActive}
				>
					{node.editProps.editTypes.map((option) => (
						<Option
							style={{ color: tokens.colorPaletteRedBorderActive, fontSize: "10px" }}
							key={option}
						>
							{option}
						</Option>
					))}
				</Dropdown>
			</div>
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
			/>
		</>
	);
}
