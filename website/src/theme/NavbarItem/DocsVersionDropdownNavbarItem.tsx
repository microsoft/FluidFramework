/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { translate } from "@docusaurus/Translate";
import {
	useVersions,
	useActiveDocContext,
	useDocsVersionCandidates,
	useDocsPreferredVersion,
} from "@docusaurus/plugin-content-docs/client";
import type {
	GlobalVersion,
	GlobalDoc,
	ActiveDocContext,
} from "@docusaurus/plugin-content-docs/client";
import { useLocation } from "@docusaurus/router";
import type { LinkLikeNavbarItemProps } from "@theme/NavbarItem";
import DefaultNavbarItem from "@theme/NavbarItem/DefaultNavbarItem";
import type { Props } from "@theme/NavbarItem/DocsVersionDropdownNavbarItem";
import DropdownNavbarItem from "@theme/NavbarItem/DropdownNavbarItem";
import type { KeyboardEvent } from "react";

/**
 * Gets the documentation page marked as the main/landing page for a version,
 * identified by the mainDocId property.
 *
 * @param version - The version object to get the main doc from
 * @returns The main documentation page for this version
 */
function getVersionMainDoc(version: GlobalVersion): GlobalDoc {
	return version.docs.find((doc) => doc.id === version.mainDocId);
}

/**
 * When navigating between versions, attempts to keep the user on the same page.
 * If the current page doesn't exist in the target version, falls back to that version's main page.
 *
 * @param version - The version being navigated to
 * @param activeDocContext - Information about the currently viewed documentation
 * @returns Either the equivalent page in the target version, or that version's main page
 */
function getVersionTargetDoc(
	version: GlobalVersion,
	activeDocContext: ActiveDocContext,
): GlobalDoc {
	return activeDocContext.alternateDocVersions[version.name] ?? getVersionMainDoc(version);
}

type AccessibleLinkProps = LinkLikeNavbarItemProps & {
	"aria-label"?: string;
	"className"?: string;
};

/**
 * Moves focus within an open desktop version dropdown.
 */
function handleVersionDropdownKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
	if (event.defaultPrevented === true || !(event.target instanceof HTMLAnchorElement)) {
		return;
	}

	const dropdown = event.currentTarget.querySelector(
		".dropdown--show, .dropdown--hoverable:hover",
	);
	if (dropdown === null) {
		return;
	}

	const links = [...dropdown.querySelectorAll<HTMLAnchorElement>(".dropdown__menu a[href]")];
	const currentIndex = links.indexOf(event.target);
	if (currentIndex === -1 && event.target !== dropdown.querySelector(".navbar__link")) {
		return;
	}

	let nextIndex: number;
	switch (event.key) {
		case "ArrowDown": {
			nextIndex = (currentIndex + 1) % links.length;
			break;
		}
		case "ArrowUp": {
			nextIndex =
				currentIndex === -1
					? links.length - 1
					: (currentIndex - 1 + links.length) % links.length;
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

	const nextLink = links[nextIndex];
	if (nextLink !== undefined) {
		event.preventDefault();
		nextLink.focus();
	}
}

/**
 * Adds accessible link labels and desktop keyboard navigation to the documentation version selector.
 *
 * @remarks
 * This component customizes the Docusaurus classic theme's `DocsVersionDropdownNavbarItem`.
 * Docusaurus still controls dropdown visibility, hover, and link activation.
 * The desktop wrapper adds ArrowUp, ArrowDown, Home, and End navigation only while the dropdown is open.
 * It leaves closed menus, mobile navigation, and single-version links unchanged.
 *
 * The keyboard handler depends on Docusaurus's dropdown state classes and its navbar and menu link markup.
 * After a Docusaurus upgrade, verify these selectors with `VersionDropdown.spec.ts`.
 * Remove the handler if upstream provides equivalent keyboard navigation.
 * Upstream closed {@link https://github.com/facebook/docusaurus/issues/11447 | facebook/docusaurus#11447} as not planned.
 * See {@link https://docusaurus.io/docs/swizzling/ | Docusaurus swizzling} for the customization mechanism.
 */
export default function DocsVersionDropdownNavbarItem({
	mobile,
	docsPluginId,
	dropdownItemsBefore,
	dropdownItemsAfter,
	...props
}: Props): JSX.Element {
	const { search, hash } = useLocation();
	const activeDocContext = useActiveDocContext(docsPluginId);
	const versions = useVersions(docsPluginId);
	const { savePreferredVersionName } = useDocsPreferredVersion(docsPluginId);

	function versionToAccessibleLink(version: GlobalVersion): AccessibleLinkProps {
		const targetDoc = getVersionTargetDoc(version, activeDocContext);
		return {
			"label": version.label,
			"to": `${targetDoc.path}${search}${hash}`,
			"isActive": () => version === activeDocContext.activeVersion,
			"onClick": () => savePreferredVersionName(version.name),
			// The link text alone ("v1", "v2") is ambiguous out of context, so name each item
			// explicitly. Deliberately omit `aria-setsize`/`aria-posinset`: Docusaurus renders these
			// items as `<a>` inside `<li>`, and those attributes are invalid on the implicit `link`
			// role (axe `aria-allowed-attr`, WCAG 4.1.2). The surrounding list already exposes set
			// size and position natively, so stating them here would also be announced twice.
			"aria-label": `Version ${version.label}`,
			"className": "version-dropdown__item",
		};
	}

	const items: AccessibleLinkProps[] = [
		...dropdownItemsBefore,
		...versions.map((version) => versionToAccessibleLink(version)),
		...dropdownItemsAfter,
	];

	const dropdownVersion = useDocsVersionCandidates(docsPluginId)?.[0];

	const dropdownLabel =
		mobile === true && items.length > 1
			? translate({
					id: "theme.navbar.mobileVersionsDropdown.label",
					message: "Versions",
					description: "The label for the navbar versions dropdown on mobile view",
				})
			: dropdownVersion.label;
	const dropdownTo =
		mobile === true && items.length > 1
			? undefined
			: getVersionTargetDoc(dropdownVersion, activeDocContext).path;

	// Do not display this navbar item if current page is not a doc
	if (!activeDocContext.activeDoc) {
		return <></>;
	}

	if (items.length <= 1) {
		return (
			<DefaultNavbarItem {...props} mobile={mobile} label={dropdownLabel} to={dropdownTo} />
		);
	}

	return (
		<div
			className="version-dropdown-wrapper"
			onKeyDown={mobile === true ? undefined : handleVersionDropdownKeyDown}
		>
			<DropdownNavbarItem
				{...props}
				mobile={mobile}
				label={dropdownLabel}
				to={dropdownTo}
				items={items}
				aria-label="Select documentation version"
			/>
		</div>
	);
}
