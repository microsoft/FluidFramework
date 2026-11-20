/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ApiClass,
	ApiInterface,
	type ApiItem,
	ApiMethod,
	ApiMethodSignature,
	ApiPropertyItem,
	ApiTypeAlias,
	type Excerpt,
} from "@microsoft/api-extractor-model";

import { type ApiTypeLike, isStatic } from "../../utilities/index.js";
import type { ApiItemTransformationConfiguration } from "../configuration/index.js";

import { shouldItemBeIncluded } from "./ApiItemVisibility.js";
import {
	bindBase,
	getMemberType,
	localBindings,
	rebind,
	type MemberType,
	type TypeBindings,
} from "./InheritedMemberTypes.js";
import { getNamedBase } from "./TypeSyntax.js";

type InstanceMember = ApiPropertyItem | ApiMethod | ApiMethodSignature;

/**
 * Records which instance member declarations a type keeps and which it overrides when its base types are combined.
 *
 * @remarks
 * The resolver applies overrides before deciding which members to document.
 * For example, if `Derived` redeclares `Base.value` but the documentation excludes `Derived.value`,
 * neither declaration should appear in the member table for `Derived`.
 * Keeping the override in `members` and the replaced declaration in `hidden` prevents `Base.value`
 * from reappearing even if another inheritance path leads to it.
 */
interface MemberSet {
	/**
	 * Maps each declared or inherited member that has not been overridden to its declaration
	 * and its type arguments in the current scope, using its canonical reference string as the key.
	 *
	 * @remarks
	 * Members excluded from the documentation still participate in override resolution.
	 */
	readonly members: Map<string, { declaration: InstanceMember; bindings: TypeBindings }>;

	/**
	 * Canonical reference strings of declarations replaced by a nearer declaration of the same name.
	 *
	 * @remarks
	 * Tracking these across base types prevents another inheritance path from reintroducing an overridden member.
	 */
	readonly hidden: Set<string>;
}

function isInstanceMember(item: ApiItem): item is InstanceMember {
	return (
		(item instanceof ApiPropertyItem ||
			item instanceof ApiMethod ||
			item instanceof ApiMethodSignature) &&
		!isStatic(item) &&
		!item.displayName.startsWith("[")
	);
}

function getBaseExcerpts(item: ApiTypeLike): readonly Excerpt[] {
	if (item instanceof ApiInterface) {
		return item.extendsTypes.map((base) => base.excerpt);
	}
	if (item instanceof ApiClass) {
		return item.extendsType === undefined ? [] : [item.extendsType.excerpt];
	}
	return [item.typeExcerpt];
}

/**
 * One step from a type to a base it extends, or from a type alias to the type it names.
 *
 * @example
 * If `StringBox` extends `Box<string>` and `Box<T>` declares `value: T`,
 * the edge points to `Box` and maps `T` to `string` so the `StringBox` table can show `value` as `string`.
 */
interface BaseEdge {
	/**
	 * The resolved declaration to inspect for members and further base types.
	 */
	readonly base: ApiTypeLike;

	/**
	 * Maps each type parameter of `base` to its argument in the referring type's scope.
	 * An `undefined` value means the resolver could not determine that argument.
	 */
	readonly bindings: TypeBindings;
}

/**
 * Finds the instance members a class, interface, or type alias declares or inherits.
 *
 * @remarks
 * It follows base types and alias targets, applies overrides, and keeps each member's original declaration
 * together with its type arguments in the derived type's scope.
 *
 * When several types share a base, the resolver reuses its completed result rather than walking that base again.
 * Each transformation has its own resolver because the loaded packages, exclusions, and release levels
 * determine which bases it can follow.
 */
class InheritanceResolver {
	/**
	 * Caches each type's direct bases or alias target, together with the type arguments used to reach them.
	 *
	 * @remarks
	 * An empty list means the resolver already checked the type and found no base it can follow.
	 */
	private readonly bases = new Map<ApiTypeLike, BaseEdge[]>();

	/**
	 * Caches member sets that other derived types can reuse.
	 *
	 * @remarks
	 * A traversal that skips a cycle yields only a partial result for its current path, so it is not cached here.
	 */
	private readonly completed = new Map<ApiTypeLike, MemberSet>();

	/**
	 * Records the source and target of each inheritance edge that has already triggered a cycle warning.
	 *
	 * @remarks
	 * Revisiting that edge skips it again without repeating the warning.
	 */
	private readonly reportedCycles = new Set<string>();

	public constructor(private readonly config: ApiItemTransformationConfiguration) {}

	/**
	 * Resolves the types named directly by an `extends` clause or a forwarding type alias.
	 *
	 * @param item - The declaration that names the bases.
	 * @returns One edge per supported, resolved base included in this documentation suite.
	 * Each edge carries the type arguments supplied by `item`, so two uses of the same generic base
	 * can produce different member types.
	 */
	private getBases(item: ApiTypeLike): BaseEdge[] {
		const cached = this.bases.get(item);
		if (cached !== undefined) {
			return cached;
		}
		const bases: BaseEdge[] = [];
		for (const excerpt of getBaseExcerpts(item)) {
			// A reference inside an expression such as `A | B` does not identify a single base.
			// Skip that expression without losing any other bases named by the same declaration.
			const target = getNamedBase(excerpt);
			if (target === undefined) {
				this.config.logger.verbose(
					`Skipping unsupported base expression "${excerpt.text}" for ${item.displayName}.`,
				);
				continue;
			}
			const { resolvedApiItem, errorMessage } =
				this.config.apiModel.resolveDeclarationReference(target.reference, undefined);
			if (resolvedApiItem === undefined) {
				this.config.logger.warning(
					`Cannot resolve base "${target.reference.toString()}" of ${item.displayName}: ${errorMessage}`,
				);
			} else if (
				(resolvedApiItem instanceof ApiClass ||
					resolvedApiItem instanceof ApiInterface ||
					resolvedApiItem instanceof ApiTypeAlias) &&
				shouldItemBeIncluded(resolvedApiItem, this.config)
			) {
				bases.push({
					base: resolvedApiItem,
					bindings: bindBase(resolvedApiItem, target.typeArguments, item),
				});
			}
		}
		this.bases.set(item, bases);
		return bases;
	}

	/**
	 * Combines the members of the direct bases before applying the declarations on `item`.
	 *
	 * @param item - The type whose instance members are being resolved.
	 * @param active - Types on the current recursion path. Start with an empty set for a top-level call.
	 *
	 * @returns The surviving declarations with their type arguments in the scope of `item`,
	 * together with the declarations they hide. Member visibility is applied after this merge.
	 *
	 * @example
	 * ```typescript
	 * interface Box<T> {
	 *     value: T;
	 *     label?: string;
	 * }
	 *
	 * interface StringBox extends Box<string> {
	 *     label: string;
	 * }
	 * ```
	 *
	 * Resolving `StringBox` keeps the original `Box.value` declaration in `members` with `T` bound to `string`.
	 * For `label`, `members` contains `StringBox.label` instead of `Box.label`.
	 * The canonical reference for `Box.label` goes into `hidden` so another inheritance path cannot reintroduce it.
	 */
	public resolve(item: ApiTypeLike, active: Set<ApiTypeLike>): MemberSet {
		const cached = this.completed.get(item);
		if (cached !== undefined) {
			return cached;
		}
		active.add(item);
		const members: MemberSet["members"] = new Map();
		const hidden = new Set<string>();
		let complete = true;
		for (const { base, bindings } of this.getBases(item)) {
			// Only revisiting a type on this path is a cycle. Two branches may legitimately share a base.
			if (active.has(base)) {
				const edge = `${item.canonicalReference.toString()} -> ${base.canonicalReference.toString()}`;
				if (!this.reportedCycles.has(edge)) {
					this.config.logger.warning(`Skipping cyclic inheritance edge: ${edge}.`);
					this.reportedCycles.add(edge);
				}
				complete = false;
				continue;
			}
			const inherited = this.resolve(base, active);

			// If a deeper call skipped a cycle, its result depends on the path taken.
			// Use what it found, but do not cache this parent result as complete either.
			complete &&= this.completed.has(base);

			// Both paths to a shared declaration contribute to one entry. If their type arguments
			// disagree, leave the binding unresolved rather than choosing a path by traversal order.
			for (const [key, member] of inherited.members) {
				members.set(key, {
					declaration: member.declaration,
					bindings: rebind(member.bindings, bindings, members.get(key)?.bindings),
				});
			}
			for (const key of inherited.hidden) {
				hidden.add(key);
			}
		}
		active.delete(item);

		// Check local names before filtering: even an excluded override must hide the base member.
		// Also remove declarations already overridden on one branch but inherited unchanged on another.
		const declared = item.members.filter(isInstanceMember);
		const localNames = new Set(declared.map((member) => member.name));
		for (const [key, member] of members) {
			if (localNames.has(member.declaration.name) || hidden.has(key)) {
				members.delete(key);
				hidden.add(key);
			}
		}

		// Here `Box<T>` still uses its own `T`. A caller following `Box<string>` will bind it to `string`.
		const declaredBindings = localBindings(item);
		for (const declaration of declared) {
			members.set(declaration.canonicalReference.toString(), {
				declaration,
				bindings: declaredBindings,
			});
		}
		const result = { members, hidden };
		if (complete) {
			this.completed.set(item, result);
		}
		return result;
	}
}

const resolvers = new WeakMap<ApiItemTransformationConfiguration, InheritanceResolver>();

/**
 * Returns each visible inherited declaration with its type in the scope of the derived item.
 *
 * @remarks
 * The original API items retain their parentage for links and for resolving references in their summaries.
 *
 * @param item - The class, interface, or type alias whose inherited members to collect.
 * Its own declarations are not returned.
 * @param config - The transformation configuration that supplies the API model and logger.
 */
export function getInheritedMembers(
	item: ApiTypeLike,
	config: ApiItemTransformationConfiguration,
): ReadonlyMap<InstanceMember, MemberType> {
	let resolver = resolvers.get(config);
	if (resolver === undefined) {
		resolver = new InheritanceResolver(config);
		resolvers.set(config, resolver);
	}
	const inherited = [...resolver.resolve(item, new Set()).members.values()].filter(
		({ declaration }) =>
			declaration.parent !== item && shouldItemBeIncluded(declaration, config),
	);
	return new Map(
		inherited.map(({ declaration, bindings }) => [
			declaration,
			getMemberType(declaration, bindings),
		]),
	);
}
