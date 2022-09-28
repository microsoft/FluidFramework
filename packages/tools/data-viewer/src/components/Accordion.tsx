/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AnimationClassNames,
    DefaultPalette,
    IStackItemStyles,
    IStackStyles,
    IconButton,
    Stack,
    initializeIcons,
} from "office-ui-fabric-react";
import React from "react";

/**
 * Fluent-UI doesn't offer an out-of-the-box Accordion component.
 * This implementation is based on {@link https://naveegator.in/accordion-in-fluent-ui-office-ui-fabric/}.
 */

// Initialize Fluent icons
initializeIcons();

const accordionHeaderStyles: IStackItemStyles = {
    root: {
        background: DefaultPalette.neutralLighter,
        padding: 5,
        cursor: "pointer",
    },
};
const accordionStyles: IStackStyles = {
    root: {
        borderStyle: "solid",
        borderWidth: 1,
        borderColor: DefaultPalette.neutralTertiary,
    },
};
const accordionConentStyles: IStackStyles = {
    root: {
        padding: 10,
    },
};

/**
 * {@link Accordion} input props.
 */
export type AccordionProps = React.PropsWithChildren<{
    /**
     * Element to display as the accordion header.
     *
     * @remarks Will always be displayed, even when collapsed.
     */
    header: React.ReactElement;

    /**
     * Whether or not the accordion should start in the collapsed state.
     *
     * @defaultValue `true`
     */
    initiallyCollapsed?: boolean;
}>;

export function Accordion(props: AccordionProps): React.ReactElement {
    const { header, children, initiallyCollapsed } = props;

    const [collapsed, setCollapsed] = React.useState<boolean>(initiallyCollapsed ?? true);

    return (
        <>
            <Stack horizontal={false} styles={accordionStyles}>
                <Stack.Item styles={accordionHeaderStyles}>
                    <Stack horizontal={true} onClick={(): void => setCollapsed(!collapsed)}>
                        <Stack.Item>
                            <IconButton
                                iconProps={{
                                    iconName: collapsed ? "ChevronRight" : "ChevronDown",
                                }}
                            />
                        </Stack.Item>
                        <Stack.Item align="center">{header}</Stack.Item>
                    </Stack>
                </Stack.Item>
                {!collapsed && (
                    <Stack.Item
                        className={AnimationClassNames.slideDownIn20}
                        styles={accordionConentStyles}
                    >
                        {children}
                    </Stack.Item>
                )}
            </Stack>
        </>
    );
}
