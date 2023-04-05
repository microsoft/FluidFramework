/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IStackStyles, Stack } from "@fluentui/react";
import React from "react";
import { tokens } from "@fluentui/react-components";

/**
 * Props for {@link MenuSection}
 */
export type MenuSectionProps = React.PropsWithChildren<{
	/**
	 * The text to display in header of the menu section.
	 */
	header: string;
}>;

/**
 * Generic component for a section of the menu.
 *
 * @internal
 */
export function MenuSection(props: MenuSectionProps): React.ReactElement {
	const { header, children } = props;

	return (
		<Stack>
			<Stack.Item styles={menuSectionHeaderStyles}>{header}</Stack.Item>
			{children}
		</Stack>
	);
}

/**
 * Props for {@link MenuItem}
 */
export interface MenuItemProps {
	onClick: (event: unknown) => void;
	text: string;
	isActive: boolean;
}

/**
 * Generic component for a menu item (under a section).
 *
 * @internal
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	return (
		<Stack.Item styles={getMenuSectionItemStyles(props.isActive)} onClick={props.onClick}>
			{props.text}
		</Stack.Item>
	);
}

const menuSectionHeaderStyles: IStackStyles = {
	root: {
		fontWeight: "bold",
		paddingLeft: "2px",
	},
};

function getMenuSectionItemStyles(isActive: boolean): IStackStyles {
	return {
		root: {
			"paddingLeft": "20px",
			"cursor": "pointer",
			"background": isActive
				? tokens.colorNeutralBackground1Selected
				: tokens.colorNeutralBackground1,
			"&:hover": {
				background: tokens.colorNeutralBackground1Hover,
			},
		},
	};
}
