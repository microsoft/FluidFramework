/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { DefaultPalette, IStackStyles, Stack } from "@fluentui/react";
import React from "react";

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
		<Stack.Item styles={menuSectionItemStyles(props.isActive)} onClick={props.onClick}>
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

function menuSectionItemStyles(isActive: boolean): IStackStyles {
	return {
		root: {
			"paddingLeft": "20px",
			"cursor": "pointer",
			"background": isActive ? DefaultPalette.themeTertiary : DefaultPalette.themeLight,
			"fontWeight": isActive ? "bold" : "",
			"&:hover": {
				background: DefaultPalette.themeSecondary,
				color: DefaultPalette.white,
			},
		},
	};
}
