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
 *
 * @internal
 */
export interface ContainerSelectionDropdownProps extends HasClientDebuggers, HasContainerId {
    /**
     * Take the selected container id to set as current viewed container id.
     * @param containerId current selected container id.
     */
    onChangeSelection(containerId: string): void;
}

/**
 * A dropdown that displays all registered containers.
 *
 */
export function ContainerSelectionDropdown(
    props: ContainerSelectionDropdownProps,
): React.ReactElement {
    const dropdownStyles: Partial<IDropdownStyles> = {
        dropdown: { width: "300px", zIndex: "1" },
    };

    const stackTokens: IStackTokens = { childrenGap: 20 };

    const { clientDebuggers, containerId } = props;

    let selectedKey = containerId;

    function renewContainerOptions(debuggers: IFluidClientDebugger[]): IDropdownOption[] {
        const options: IDropdownOption[] = [];
        for (const x of debuggers) {
            if (x.containerId === containerId) {
                selectedKey = x.containerNickname ?? x.containerId;
            }
            options.push({
                key: x.containerId,
                text: x.containerNickname ?? x.containerId,
            });
        }
        return options;
    }

    const clientDebuggerOptions = renewContainerOptions(clientDebuggers);

    const _onClientDebuggerDropdownChange = (
        event: React.FormEvent<HTMLDivElement>,
        option?: IDropdownOption,
    ): void => {
        if (option) {
            const selectedDebugger = clientDebuggers.find((c) => {
                return c.containerId === (option.key as string);
            }) as IFluidClientDebugger;
            props.onChangeSelection(selectedDebugger.containerId);
        }
    };

    return (
        <Stack tokens={stackTokens}>
            <Dropdown
                placeholder="Select an option"
                selectedKey={selectedKey}
                options={clientDebuggerOptions}
                styles={dropdownStyles}
                onChange={_onClientDebuggerDropdownChange}
            />
        </Stack>
    );
}
