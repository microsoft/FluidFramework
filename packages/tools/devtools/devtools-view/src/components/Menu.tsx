/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { makeStyles, tokens } from "@fluentui/react-components";

/**
 * Props for {@link MenuSection}
 */
export type MenuSectionProps = React.PropsWithChildren<{
	/**
	 * The text to display in header of the menu section.
	 */
	header: string;

	/**
	 * The icon to display in the header of the menu section.
	 */
	icon?: React.ReactElement;
}>;

const useMenuSectionStyles = makeStyles({
	root: {
		display: "flex",
		flexDirection: "column",
	},
	header: {
		alignItems: "center",
		display: "flex",
		flexDirection: "row",
		fontWeight: "bold",
		paddingLeft: "2px",
	},
});

/**
 * Generic component for a section of the menu.
 */
export function MenuSection(props: MenuSectionProps): React.ReactElement {
	const { header, icon, children } = props;

	const styles = useMenuSectionStyles();

	return (
		<div className={styles.root}>
			<div className={styles.header}>
				{header}
				{icon}
			</div>
			{children}
		</div>
	);
}

/**
 * Props for {@link MenuItem}
 */
export interface MenuItemProps {
	onClick: (event: unknown) => void;
	text: string;
	isActive: boolean;

	/**
	 * The icon to display in the header of the menu section.
	 */
	icon?: React.ReactElement;
}

const useMenuItemStyles = makeStyles({
	root: {
		"alignItems": "center",
		"cursor": "pointer",
		"display": "flex",
		"flexDirection": "row",
		"paddingLeft": "20px",
		"&:hover": {
			backgroundImage: tokens.colorNeutralBackground1Hover,
		},
	},
});
/**
 * Generic component for a menu item (under a section).
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	const { icon, isActive, onClick, text } = props;

	const styles = useMenuItemStyles();

	return (
		<div
			className={styles.root}
			style={{
				background: isActive
					? tokens.colorNeutralBackground1Selected
					: tokens.colorNeutralBackground1,
			}}
			onClick={onClick}
		>
			{text}
			{icon}
		</div>
	);
}
