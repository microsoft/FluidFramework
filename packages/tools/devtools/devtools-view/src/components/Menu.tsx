/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { makeStyles, mergeClasses, tokens } from "@fluentui/react-components";

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
		paddingLeft: "5px",
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
}

const useMenuItemStyles = makeStyles({
	root: {
		"alignItems": "center",
		"cursor": "pointer",
		"display": "flex",
		"flexDirection": "row",
		"paddingLeft": "20px",
		"&:hover": {
			color: tokens.colorNeutralForeground1Hover,
			backgroundImage: tokens.colorNeutralBackground1Hover,
		},
	},
	active: {
		color: tokens.colorNeutralForeground1Selected,
		backgroundImage: tokens.colorNeutralBackground1Selected,
	},
	inactive: {
		color: tokens.colorNeutralForeground1,
		backgroundImage: tokens.colorNeutralBackground1,
	},
});

/**
 * Generic component for a menu item (under a section).
 */
export function MenuItem(props: MenuItemProps): React.ReactElement {
	const { isActive, onClick, text } = props;

	const styles = useMenuItemStyles();
	const style = mergeClasses(styles.root, isActive ? styles.active : styles.inactive);

	return (
		<div className={style} onClick={onClick}>
			{text}
		</div>
	);
}
