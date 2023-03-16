/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dropdown, IDropdownOption, IDropdownStyles, IStackTokens, Stack } from "@fluentui/react";
import React from "react";

import { ContainerMetadata } from "@fluid-tools/client-debugger";

/**
 * {@link ContainerSelectionDropdownProps} input props.
 *
 * @internal
 */
export interface ContainerSelectionDropdownProps {
	/**
	 * The Container ID of the current selection.
	 */
	initialSelection?: string;

	/**
	 * Full list of drop-down options.
	 */
	options: ContainerMetadata[];

	/**
	 * Called when the selection changes.
	 * @param containerId - The newly selected Container ID.
	 */
	onChangeSelection(containerId: string | undefined): void;
}

/**
 * A dropdown menu for selecting the Fluid Container to display debug information about.
 *
 * @internal
 */
export function ContainerSelectionDropdown(
	props: ContainerSelectionDropdownProps,
): React.ReactElement {
	const dropdownStyles: Partial<IDropdownStyles> = {
		dropdown: { width: "300px", zIndex: "1" },
	};

	const stackTokens: IStackTokens = { childrenGap: 20 };

	const { options, initialSelection, onChangeSelection } = props;

	// Options formatted for the Fluent Dropdown component
	const dropdownOptions: IDropdownOption[] = options.map((option) => ({
		key: option.id,
		text: option.nickname ?? option.id,
		selected: option.id === initialSelection,
	}));

	return (
		<Stack tokens={stackTokens}>
			<Dropdown
				placeholder="Select a Fluid Container"
				selectedKey={initialSelection}
				options={dropdownOptions}
				styles={dropdownStyles}
				onChange={(event, option): void => onChangeSelection(option?.key as string)}
			/>
		</Stack>
	);
}
