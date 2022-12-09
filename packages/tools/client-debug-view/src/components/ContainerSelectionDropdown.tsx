/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dropdown, IDropdownOption, IDropdownStyles, IStackTokens, Stack } from "@fluentui/react";
import React from "react";

import { IFluidClientDebugger, getFluidClientDebuggers } from "@fluid-tools/client-debugger";

import { HasClientDebugger } from "../CommonProps";

/**
 * {@link ContainerSelectionDropdown} input props.
 */
export type ContainerSelectionDropdownProps = HasClientDebugger;

/**
 * Small header that displays core container data.
 *
 * @param props - See {@link ContainerSelectionDropdownProps}.
 */
export function ContainerSelectionDropdown(
	props: ContainerSelectionDropdownProps,
): React.ReactElement {
	const dropdownStyles: Partial<IDropdownStyles> = {
		dropdown: { width: "300px", zIndex: "1" },
	};

	const stackTokens: IStackTokens = { childrenGap: 20 };

	const [clientDebuggers] = React.useState<IFluidClientDebugger[]>(getFluidClientDebuggers());

	const _clientDebuggerOptions: IDropdownOption[] = [];

	for (const x of clientDebuggers) {
		console.log(x.containerId);
		_clientDebuggerOptions.push({
			key: x.containerId,
			text: x.containerNickname ?? x.containerId,
		});
	}

	const _onClientDebuggerDropdownChange = (
		event: React.FormEvent<HTMLDivElement>,
		option?: IDropdownOption,
	): void => {
		if (option) {
			const selectedDebugger = clientDebuggers.find((c) => {
				return c.containerId === (option.key as string);
			}) as IFluidClientDebugger;
			props.clientDebugger = selectedDebugger;
		}
	};

	return (
		<Stack tokens={stackTokens}>
			<Dropdown
				placeholder="Select an option"
				label="Containers: "
				options={_clientDebuggerOptions}
				styles={dropdownStyles}
				onChange={_onClientDebuggerDropdownChange}
			/>
		</Stack>
	);
}
