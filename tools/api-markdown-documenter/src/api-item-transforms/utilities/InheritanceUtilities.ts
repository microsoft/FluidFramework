/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiClass,
	ApiInterface,
	type ApiItem,
	ApiItemKind,
	type HeritageType,
} from "@microsoft/api-extractor-model";

import { getApiItemKind, type ApiTypeLike, isTypeLike } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { filterItems } from "./ApiItemTransformUtilities.js";

/**
 * TODO
 */
export interface TypeMemberBase<TApiItem extends ApiItem = ApiItem> {
	readonly kind: "own" | "inherited";
	readonly item: TApiItem;
}

/**
 * TODO
 */
export interface OwnTypeMember<TApiItem extends ApiItem = ApiItem>
	extends TypeMemberBase<TApiItem> {
	readonly kind: "own";
}

/**
 * TODO
 */
export interface InheritedTypeMember<TApiItem extends ApiItem = ApiItem>
	extends TypeMemberBase<TApiItem> {
	readonly kind: "inherited";
	readonly inheritedFrom: ApiItem;
}

/**
 * TODO
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
	const members: TypeMember[] = [];

	const ownMembers: OwnTypeMember[] = filterItems(apiItem.members, config).map((member) => ({
		kind: "own",
		item: member,
	}));

	members.push(...ownMembers);

	// TODO: get inherited members
	// interface, class, type-alias
	if (apiItem instanceof ApiClass) {
		// Inherit members from `extends` clause
		if (apiItem.extendsType !== undefined) {
			const inheritedMembers = getInheritedMembers(apiItem, apiItem.extendsType, config);
			if (inheritedMembers !== undefined) {
				members.push(...inheritedMembers);
			}
		}

		// Inherit members from `implements` clauses
		for (const implementsType of apiItem.implementsTypes) {
			const inheritedMembers = getInheritedMembers(apiItem, implementsType, config);
			if (inheritedMembers !== undefined) {
				members.push(...inheritedMembers);
			}
		}
	} else if (apiItem instanceof ApiInterface) {
		// Inherit members from `extends` clauses
		for (const extendsType of apiItem.extendsTypes) {
			const inheritedMembers = getInheritedMembers(apiItem, extendsType, config);
			if (inheritedMembers !== undefined) {
				members.push(...inheritedMembers);
			}
		}
	} else {
		// TODO: type-alias
	}

	return members;
}

function getInheritedMembers(
	apiItem: ApiItem,
	extendsType: HeritageType,
	config: ApiItemTransformationConfiguration,
): TypeMember[] | undefined {
	const referencedItem = resolveHeritageTypeToItem(apiItem, extendsType, config);
	if (referencedItem === undefined || !isTypeLike(referencedItem)) {
		return undefined;
	}
	const referencedItemMembers: TypeMember[] = getTypeMembers(referencedItem, config).map(
		(inherited) => ({
			kind: "inherited",
			item: inherited.item,
			inheritedFrom: referencedItem,
		}),
	);

	// Don't inherit constructors, or members directly declared / overrided on the item itself.
	return referencedItemMembers.filter((inherited) => {
		const itemKind = getApiItemKind(inherited.item);
		if (itemKind === ApiItemKind.Constructor || itemKind === ApiItemKind.ConstructSignature) {
			return false;
		}

		return !apiItem.members.some(
			(ownMember) => ownMember.containerKey === inherited.item.containerKey,
		);
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
