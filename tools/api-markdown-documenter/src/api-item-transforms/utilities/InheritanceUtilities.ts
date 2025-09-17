/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ApiClass,
	type ApiInterface,
	type ApiItem,
	ApiItemKind,
	type HeritageType,
} from "@microsoft/api-extractor-model";

import {
	getApiItemKind,
	type ApiTypeLike,
	isTypeLike,
	isStatic,
} from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { filterItems } from "./ApiItemTransformUtilities.js";

/**
 * API-Extractor does not directly provide a way to get inherited members of an API item.
 * These utilities work around that limitation to provide a best-effort approximation of inherited members.
 *
 * If, in the future, API-Extractor provides a better way to get inherited members, these utilities should be updated or removed as appropriate.
 */

/**
 * {@link TypeMember} base interface.
 */
export interface TypeMemberBase<TApiItem extends ApiItem = ApiItem> {
	/**
	 * The kind of type member.
	 * "own" if the member is directly declared on the API item.
	 * "inherited" if the member is inherited from a base type.
	 */
	readonly kind: "own" | "inherited";

	/**
	 * The API item that is the member.
	 */
	readonly item: TApiItem;
}

/**
 * Represents a type member that is directly declared on the API item.
 */
export interface OwnTypeMember<TApiItem extends ApiItem = ApiItem>
	extends TypeMemberBase<TApiItem> {
	readonly kind: "own";

	/**
	 * The member on some base type that this member overrides, if any.
	 * @remarks For example, if this member is a method that overrides a method on a base class, this would be that base method.
	 */
	readonly overrides: ApiItem | undefined; // TODO: optional
}

/**
 * Represents a type member that is inherited from a base type.
 */
export interface InheritedTypeMember<TApiItem extends ApiItem = ApiItem>
	extends TypeMemberBase<TApiItem> {
	readonly kind: "inherited";

	/**
	 * The API item from which this member is inherited.
	 * @remarks For example, if this member is a method inherited from a base class, this would be that base class.
	 */
	readonly baseDefinition: ApiItem;
}

/**
 * A type member, which may be either directly declared on the API item or inherited from a base type.
 */
export type TypeMember<TApiItem extends ApiItem = ApiItem> =
	| OwnTypeMember<TApiItem>
	| InheritedTypeMember<TApiItem>;

/**
 * Gets the members of the specified API item, including inherited members where applicable.
 * @param apiItem - The API item being queried.
 * @param config - See {@link ApiItemTransformationConfiguration}.
 */
export function getTypeMembers<TApiItem extends ApiTypeLike>(
	apiItem: TApiItem,
	config: ApiItemTransformationConfiguration,
): TypeMember[] {
	// Get inherited members
	const inheritedMembers: InheritedTypeMember[] = [];
	if (apiItem.kind === ApiItemKind.Class) {
		const apiClass = apiItem as ApiClass;

		// Inherit members from `extends` clause
		if (apiClass.extendsType !== undefined) {
			inheritedMembers.push(...getInheritedMembers(apiClass, apiClass.extendsType, config));
		}

		// Inherit members from `implements` clauses
		for (const implementsType of apiClass.implementsTypes) {
			inheritedMembers.push(...getInheritedMembers(apiClass, implementsType, config));
		}
	} else if (apiItem.kind === ApiItemKind.Interface) {
		const apiInterface = apiItem as ApiInterface;

		// Inherit members from `extends` clauses
		for (const extendsType of apiInterface.extendsTypes) {
			inheritedMembers.push(...getInheritedMembers(apiInterface, extendsType, config));
		}
	} else {
		// TODO: type-alias
	}

	const ownMemberItems = filterItems(apiItem.members, config);

	const ownMembers: OwnTypeMember[] = [];
	for (const ownMemberItem of ownMemberItems) {
		const override = inheritedMembers.find(
			// TODO: this almost certainly isn't right. Probably want to use canonicalReference.
			(inherited) => inherited.item.containerKey === ownMemberItem.containerKey,
		);

		// If this member overrides a base member, remove that base member from the inherited members list.
		// We only want to display our override.
		if (override) {
			inheritedMembers.splice(inheritedMembers.indexOf(override), 1);
		}

		ownMembers.push({
			kind: "own",
			item: ownMemberItem,
			overrides: override?.item,
		});
	}

	// TODO: document ordering
	return [...inheritedMembers, ...ownMembers];
}

function getInheritedMembers(
	apiItem: ApiItem,
	extendsType: HeritageType,
	config: ApiItemTransformationConfiguration,
): InheritedTypeMember[] {
	const referencedItem = resolveHeritageTypeToItem(apiItem, extendsType, config);
	if (referencedItem === undefined || !isTypeLike(referencedItem)) {
		return [];
	}
	const referencedItemMembers: InheritedTypeMember[] = getTypeMembers(
		referencedItem,
		config,
	).map((inherited) => ({
		kind: "inherited",
		item: inherited.item,
		// If the item we're inheriting is itself inherited, preserve the original source.
		// Otherwise, the source is the item we're inheriting from.
		inheritedFrom: inherited.kind === "inherited" ? inherited.baseDefinition : referencedItem,
	}));

	// Don't inherit constructors or static members
	return referencedItemMembers.filter((inherited) => {
		const itemKind = getApiItemKind(inherited.item);
		if (itemKind === ApiItemKind.Constructor || itemKind === ApiItemKind.ConstructSignature) {
			return false;
		}
		if (isStatic(inherited.item)) {
			return false;
		}
		return true;
	});
}

function resolveHeritageTypeToItem(
	contextApiItem: ApiItem,
	heritageType: HeritageType,
	config: ApiItemTransformationConfiguration,
): ApiItem | undefined {
	const excerpt = heritageType.excerpt;
	if (excerpt.spannedTokens.length === 0) {
		return undefined;
	}

	if (excerpt.spannedTokens.length > 1) {
		// If there are multiple tokens, then the type expression is more complex than a single reference.
		// This is a case we don't currently support.
		return undefined;
	}

	const token = excerpt.spannedTokens[0];
	if (token.kind !== "Reference" || token.canonicalReference === undefined) {
		// If the single token is not a reference, then there is nothing to resolve.
		return undefined;
	}

	const resolvedReference = config.apiModel.resolveDeclarationReference(
		token.canonicalReference,
		contextApiItem,
	);

	return resolvedReference.resolvedApiItem;
}
