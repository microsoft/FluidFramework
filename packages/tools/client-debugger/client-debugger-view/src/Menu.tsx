/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, IStackStyles, Stack } from "@fluentui/react";
import React from "react";

/**
 * Props for {@link MenuSection}
 */
export interface MenuSectionProps {
	header: string;
}

/**
 * Generic component for a section of the menu.
 *
 * @internal
 */
export function MenuSection(props: React.PropsWithChildren<MenuSectionProps>): React.ReactElement {
	const { header, children } = props;

	return (
		<Stack styles={menuSectionStyles}>
			<Stack.Item styles={menuSectionHeaderStyles}>{header}</Stack.Item>
			{children}
		</Stack>
	);
}

/**
 * Props for {@link MenuItem}
 */
export interface MenuItemProps {
	onClick: React.MouseEventHandler<HTMLButtonElement>;
	text: string;
}

/**
 * Generic component for a menu item (under a section).
 *
 * @internal
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	return (
		<Stack.Item styles={menuSectionItemStyles} onClick={props.onClick}>
			{props.text}
		</Stack.Item>
	);
}

const menuSectionStyles: IStackStyles = {
	root: {
		background: DefaultPalette.themeLight,
		border: `1px 1px 0px 1px solid ${DefaultPalette.themePrimary}`,
		padding: "3px",
	},
};
const menuSectionHeaderStyles: IStackStyles = {
	root: {
		border: `1px solid ${DefaultPalette.themePrimary}`,
		background: DefaultPalette.themeLighterAlt,
		fontWeight: "bold",
		paddingLeft: "2px",
	},
};

const menuSectionItemStyles: IStackStyles = {
	root: {
		paddingLeft: "20px",
		cursor: "pointer",
	},
};
