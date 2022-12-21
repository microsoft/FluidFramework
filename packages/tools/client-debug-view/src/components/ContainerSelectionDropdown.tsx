/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dropdown, IDropdownOption, IDropdownStyles, IStackTokens, Stack } from "@fluentui/react";
import React from "react";

import {
	DebuggerRegistry,
	IFluidClientDebugger,
	getDebuggerRegistry,
	getFluidClientDebuggers,
} from "@fluid-tools/client-debugger";

/**
 * Small header that displays core container data.
 *
 */
export function ContainerSelectionDropdown(): React.ReactElement {
	const dropdownStyles: Partial<IDropdownStyles> = {
		dropdown: { width: "300px", zIndex: "1" },
	};

	const stackTokens: IStackTokens = { childrenGap: 20 };

	const debuggerRegistry: DebuggerRegistry = getDebuggerRegistry();

	function renewContainerOptions(debuggers: IFluidClientDebugger[]): IDropdownOption[] {
		const options: IDropdownOption[] = [];
		for (const x of debuggers) {
			console.log(x.containerId);
			options.push({
				key: x.containerId,
				text: x.containerNickname ?? x.containerId,
			});
		}
		return options;
	}

	const [clientDebuggers, setClientDebuggers] = React.useState<IFluidClientDebugger[]>(
		getFluidClientDebuggers(),
	);

	let clientDebuggerOptions = renewContainerOptions(clientDebuggers);

	React.useEffect(() => {
		function onDebuggerChanged(): void {
			setClientDebuggers(getFluidClientDebuggers());
			clientDebuggerOptions = renewContainerOptions(clientDebuggers);
		}

		debuggerRegistry.on("debuggerRegistered", onDebuggerChanged);
		debuggerRegistry.on("debuggerClosed", onDebuggerChanged);

		return (): void => {
			debuggerRegistry.off("debuggerRegistered");
			debuggerRegistry.off("debuggerClosed");
		};
	}, [clientDebuggers, clientDebuggerOptions, setClientDebuggers]);

	const _onClientDebuggerDropdownChange = (
		event: React.FormEvent<HTMLDivElement>,
		option?: IDropdownOption,
	): void => {
		if (option) {
			const selectedDebugger = clientDebuggers.find((c) => {
				return c.containerId === (option.key as string);
			}) as IFluidClientDebugger;
			debuggerRegistry.setCurrentDisplayDebugger(selectedDebugger);
		}
	};

	return (
		<Stack tokens={stackTokens}>
			<Dropdown
				placeholder="Select an option"
				label="Containers: "
				options={clientDebuggerOptions}
				styles={dropdownStyles}
				onChange={_onClientDebuggerDropdownChange}
			/>
		</Stack>
	);
}
