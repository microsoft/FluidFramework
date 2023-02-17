/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dropdown, IDropdownOption, IDropdownStyles, IStackTokens, Stack } from "@fluentui/react";
import React from "react";

import { IFluidClientDebugger } from "@fluid-tools/client-debugger";
import { HasClientDebuggers, HasContainerId } from "../CommonProps";

/**
 * {@link ContainerSelectionDropdownProps} input props.
 */
export interface ContainerSelectionDropdownProps extends HasClientDebuggers, HasContainerId {
	/**
	 * Take the selected container id to set as current viewed container id.
	 * @param containerId - current selected container id.
	 */
	onChangeSelection(containerId: string): void;
}

/**
 * A dropdown menu for selecting the Fluid Container to display debug information about.
 */
export function ContainerSelectionDropdown(
	props: ContainerSelectionDropdownProps,
): React.ReactElement {
	const dropdownStyles: Partial<IDropdownStyles> = {
		dropdown: { width: "300px", zIndex: "1" },
	};

	const stackTokens: IStackTokens = { childrenGap: 20 };

	const { clientDebuggers, containerId } = props;

	function renewContainerOptions(debuggers: IFluidClientDebugger[]): IDropdownOption[] {
		const options: IDropdownOption[] = [];
		for (const each_debugger of debuggers) {
			options.push({
				key: each_debugger.containerId,
				text: each_debugger.containerNickname ?? each_debugger.containerId,
			});
		}
		return options;
	}

	const clientDebuggerOptions = renewContainerOptions(clientDebuggers);

	const _onClientDebuggerDropdownChange = (
		event: React.FormEvent<HTMLDivElement>,
		option?: IDropdownOption,
	): void => {
		if (option !== undefined) {
			const selectedDebugger = clientDebuggers.find((clientDebugger) => {
				return clientDebugger.containerId === (option.key as string);
			});

			if (selectedDebugger === undefined) {
				throw new Error(
					`Could not find a debugger associated with Container ID "${option.key}". This likely indicates an internal state issue.`,
				);
			}
			props.onChangeSelection(selectedDebugger.containerId);
		}
	};

	return (
		<Stack tokens={stackTokens}>
			<Dropdown
				placeholder="Select an option"
				selectedKey={containerId}
				options={clientDebuggerOptions}
				styles={dropdownStyles}
				onChange={_onClientDebuggerDropdownChange}
			/>
		</Stack>
	);
}
