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
	StackItem,
	mergeStyleSets,
} from "@fluentui/react";
import React from "react";

/**
 * Fluent-UI doesn't offer an out-of-the-box Accordion component.
 * This implementation is based on {@link https://naveegator.in/accordion-in-fluent-ui-office-ui-fabric/}.
 */

/**
 * Default style used by the Accordion's header component.
 * @remarks May be overridden by {@link AccordionProps.headerStyles}.
 */
const accordionHeaderStyles: IStackItemStyles = {
	root: {
		background: DefaultPalette.neutralLight,
		padding: 5,
	},
};

/**
 * Style used by the Accordion's body component.
 */
const accordionStyles: IStackStyles = {
	root: {
		borderStyle: "solid",
		borderWidth: 1,
		borderColor: DefaultPalette.neutralTertiary,
		color: DefaultPalette.neutralDark,
	},
};

/**
 * Default style used by the Accordion's child item components.
 * @remarks May be overridden by {@link AccordionProps.contentStyles}.
 */
const accordionContentStyles: IStackStyles = {
	root: {
		padding: 10,
		color: DefaultPalette.neutralDark,
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

	/**
	 * Optional styling for the Accordion's header component.
	 */
	headerStyles?: IStackStyles;

	/**
	 * Optional styling for each of the Accordion's child items.
	 */
	contentStyles?: IStackStyles;
}>;

/**
 * A simple accordion-style vertical list.
 *
 * Displays a header, and a series of child items. May be collapsed or expanded via UI button.
 */
export function Accordion(props: AccordionProps): React.ReactElement {
	const { header, children, initiallyCollapsed, headerStyles, contentStyles } = props;

	const [collapsed, setCollapsed] = React.useState<boolean>(initiallyCollapsed ?? true);

	return (
		<Stack horizontal={false} styles={accordionStyles}>
			<StackItem styles={mergeStyleSets(accordionHeaderStyles, headerStyles)}>
				<Stack horizontal={true} onClick={(): void => setCollapsed(!collapsed)}>
					<StackItem>
						<IconButton
							iconProps={{
								iconName: collapsed ? "ChevronRight" : "ChevronDown",
							}}
							data-testid="expand-button"
						/>
					</StackItem>
					<StackItem align="center">{header}</StackItem>
				</Stack>
			</StackItem>
			{!collapsed && (
				<StackItem
					className={AnimationClassNames.slideDownIn20}
					styles={mergeStyleSets(contentStyles, accordionContentStyles)}
				>
					{children}
				</StackItem>
			)}
		</Stack>
	);
}
