/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Portions copyright (c) Facebook, Inc. and its affiliates.
 * Licensed under the MIT License.
 */

import NavbarItem from "@theme/NavbarItem";
import type { Props } from "@theme/NavbarItem/DropdownNavbarItem/Desktop";
import NavbarNavLink from "@theme/NavbarItem/NavbarNavLink";
import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

/**
 * Adds keyboard navigation and dismissal to desktop navbar dropdowns.
 *
 * @remarks
 * This override ejects the Docusaurus 3.10.2 classic theme's `DropdownNavbarItem/Desktop` component.
 * See {@link https://docusaurus.io/docs/swizzling | Docusaurus swizzling}.
 * It applies to all desktop navbar dropdowns, including the documentation version selector.
 * The mobile component remains unchanged.
 *
 * Changes from the upstream component:
 * - ArrowDown and ArrowUp open the dropdown and focus its first or last link.
 * - Arrow keys move focus between links and wrap at either end. Home and End focus the first or last link.
 * - Escape closes the dropdown and restores focus to its trigger.
 * - React state replaces `dropdown--hoverable` so Escape and outside focus can dismiss a menu under the pointer.
 * Separate hover state keeps a keyboard-open menu visible after the pointer leaves.
 * `aria-expanded` reflects both keyboard and hover visibility.
 *
 * The override preserves Enter and Space toggles, pointer navigation, and outside click, touch, and focus dismissal.
 * Tab follows the normal focus order and dismisses the dropdown when focus leaves it.
 *
 * Upstream discussed arrow navigation in {@link https://github.com/facebook/docusaurus/issues/11447 | facebook/docusaurus#11447}
 * and closed the request as not planned. This override adds the behavior required by Fluid Framework.
 * The separate screen-reader activation issue, {@link https://github.com/facebook/docusaurus/issues/8478 | facebook/docusaurus#8478},
 * remains outside this override's scope.
 * After a Docusaurus upgrade, compare the upstream component with these changes.
 * Remove this override only when upstream provides equivalent behavior and `VersionDropdown.spec.ts` passes without it.
 */
export default function DropdownNavbarItemDesktop({
	items,
	position,
	className,
	onClick,
	...props
}: Props): ReactNode {
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	// Keep keyboard-open menus visible when the pointer leaves.
	const [showDropdownOnHover, setShowDropdownOnHover] = useState(false);
	const isDropdownVisible = showDropdown === true || showDropdownOnHover === true;

	const closeDropdown = useCallback((): void => {
		setShowDropdown(false);
		setShowDropdownOnHover(false);
	}, []);

	const getDropdownLinks = (): HTMLAnchorElement[] => {
		const dropdown = dropdownRef.current as HTMLDivElement | null;
		const links: HTMLAnchorElement[] = [];
		const dropdownLinks =
			dropdown?.querySelectorAll<HTMLAnchorElement>(".dropdown__menu a[href]");
		if (dropdownLinks !== undefined) {
			for (const link of dropdownLinks) {
				links.push(link);
			}
		}
		return links;
	};

	const focusTrigger = (): void => {
		dropdownRef.current?.querySelector<HTMLElement>('.navbar__link[role="button"]')?.focus();
	};

	const openAndFocus = (target: "first" | "last"): void => {
		setShowDropdown(true);
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				const links = getDropdownLinks();
				links[target === "first" ? 0 : links.length - 1]?.focus();
			});
		});
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent | TouchEvent | FocusEvent): void => {
			if (
				dropdownRef.current === null ||
				dropdownRef.current.contains(event.target as Node) === true
			) {
				return;
			}
			closeDropdown();
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("touchstart", handleClickOutside);
		document.addEventListener("focusin", handleClickOutside);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("touchstart", handleClickOutside);
			document.removeEventListener("focusin", handleClickOutside);
		};
	}, [closeDropdown]);

	const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
		const links = getDropdownLinks();
		const currentIndex = links.findIndex(
			(link) => link === event.target || link.contains(event.target as Node),
		);

		if (event.key === "Escape") {
			event.preventDefault();
			closeDropdown();
			focusTrigger();
			return;
		}

		if (currentIndex === -1) {
			return;
		}

		let nextIndex: number | undefined;
		switch (event.key) {
			case "ArrowDown": {
				nextIndex = (currentIndex + 1) % links.length;
				break;
			}
			case "ArrowUp": {
				nextIndex = (currentIndex - 1 + links.length) % links.length;
				break;
			}
			case "Home": {
				nextIndex = 0;
				break;
			}
			case "End": {
				nextIndex = links.length - 1;
				break;
			}
			default: {
				return;
			}
		}

		event.preventDefault();
		links[nextIndex]?.focus();
	};

	return (
		<div
			ref={dropdownRef}
			className={clsx("navbar__item", "dropdown", {
				"dropdown--right": position === "right",
				"dropdown--show": isDropdownVisible === true,
			})}
			onMouseEnter={() => {
				setShowDropdownOnHover(true);
			}}
			onMouseLeave={() => {
				setShowDropdownOnHover(false);
			}}
		>
			<NavbarNavLink
				aria-haspopup="true"
				aria-expanded={isDropdownVisible}
				role="button"
				href={props.to === undefined ? "#" : undefined}
				className={clsx("navbar__link", className)}
				{...props}
				onClick={props.to === undefined ? (event) => event.preventDefault() : undefined}
				onKeyDown={(event) => {
					switch (event.key) {
						case "ArrowDown": {
							event.preventDefault();
							openAndFocus("first");
							break;
						}
						case "ArrowUp": {
							event.preventDefault();
							openAndFocus("last");
							break;
						}
						case "Enter":
						case " ": {
							event.preventDefault();
							if (isDropdownVisible === true) {
								closeDropdown();
							} else {
								setShowDropdown(true);
							}
							break;
						}
						case "Escape": {
							if (isDropdownVisible === true) {
								event.preventDefault();
								closeDropdown();
							}
							break;
						}
						default:
					}
				}}
			>
				{props.children ?? props.label}
			</NavbarNavLink>
			<ul className="dropdown__menu" onKeyDown={handleMenuKeyDown}>
				{items.map((childItemProps, index) => (
					<NavbarItem
						isDropdownItem
						activeClassName="dropdown__link--active"
						{...childItemProps}
						key={index}
					/>
				))}
			</ul>
		</div>
	);
}
