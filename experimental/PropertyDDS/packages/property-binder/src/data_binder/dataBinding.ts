/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ArrayChangeSetIterator,
	PathHelper,
	TypeIdHelper,
	Utils,
} from "@fluid-experimental/property-changeset";
/**
 * @fileoverview Defines the base DataBinding that all DataBindings should inherit from.
 */
import {
	BaseProperty,
	PropertyFactory,
	ReferenceProperty,
} from "@fluid-experimental/property-properties";

import _ from "lodash";
import {
	getInNestedObjects,
	getOrInsertDefaultInNestedObjects,
} from "../external/utils/nestedObjectHelpers.js";
import { DataBinder, DataBinderHandle, IRegisterOnPathOptions } from "../index.js";
import { RESOLVE_ALWAYS, RESOLVE_NEVER, RESOLVE_NO_LEAFS } from "../internal/constants.js";
import { PropertyElement } from "../internal/propertyElement.js";
import { isCollection, isReferenceProperty } from "../internal/typeGuards.js";
import { IRegisterOnPropertyOptions } from "./IRegisterOnPropertyOptions.js";
import { concatTokenizedPath } from "./dataBindingTree.js";
import {
	createHandle,
	createRegistrationFunction,
	deferCallback,
	escapeTokenizedPathForMap,
	getOrCreateMemberOnPrototype,
	initializeReferencePropertyTableNode,
	installForEachPrototypeMember,
	invokeCallbacks,
	invokeWithCollectionProperty,
	invokeWithProperty,
	isDataBindingRegistered,
	unescapeTokenizedStringForMap,
} from "./internalUtils.js";
import { ModificationContext } from "./modificationContext.js";
import { RemovalContext } from "./removalContext.js";

/**
 * _globalVisitIndex is to avoid callbacks being called twice. This works around bugs in getChangesToTokenizedPaths
 * which may visit properties with multiple nested changes several time
 * @hidden
 */
let _globalVisitIndex = 0;

/**
 * @hidden
 */
const validOptions = ["requireProperty", "isDeferred"];

// An object containing the initialization parameters.
export interface DataBindingParams {
	// The property that this binding represents.
	property?: BaseProperty;
	// The DataBinder that created this binding
	dataBinder?: DataBinder;
	// The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
	bindingType?: string;
	// the information relating to the activation (userData, databinder...)
	activationInfo?: any;
}

export interface DataBindingOptions {
	// Removals are simulated
	simulated?: boolean;
	// Was this handler indirectly called by a _referenceTargetChanged handler
	calledForReferenceTargetChanged?: boolean;
	// Should any reference target handlers at the root of the tree also be removed?
	removeRootCallbacks?: boolean;
	// Should we fire removals for the root of the tree?
	callRootRemovals?: boolean;
	// Fire removal callbacks where appropriate.Otherwise, just tear down the handles
	callRemovals?: boolean;
}

export interface CallbackOptions {
	// If true, the callback is executed after the current ChangeSet processing is complete. The default is false.
	isDeferred?: boolean;
}

/**
 * The base class all data bindings should inherit from. using {@link DataBinder.defineDataBinding} and
 * {@link DataBinder.activateDataBinding}, the class can be instantiated for properties in the workspace
 * attached to the DataBinder.
 *
 * The DataBinding class is told of onPreModify, onModify, onPreRemove, onRemove etc. These can be overloaded
 * to get the expected behaviors.
 * In addition, {@link DataBinding.registerOnPath} can be used to register for more granular events regarding
 * insert, modify and delete for subpaths rooted at the associated property.
 * @alias DataBinding
 * @internal
 */
export class DataBinding {
	static __absolutePathInternalBinding: boolean;

	_property: BaseProperty | undefined;

	_referenceCount: number;

	_activationInfo: any;

	_referencePropertyTable: {};

	_registeredPaths: any;

	_forEachPrototypeMember: any | undefined;

	__numDataBinders: number | undefined;

	_allPathHandles: any | undefined;

	/**
	 * @constructor
	 * @package
	 * @hideconstructor
	 * @hidden
	 */
	constructor(in_params: DataBindingParams) {
		this._property = in_params.property;
		this._referenceCount = 0;
		this._activationInfo = in_params.activationInfo;
		this._referencePropertyTable = {};
	}

	/**
	 * Returns the userData associated with the data binding (if set). This userData value was provided when
	 * the DataBinding was activated using {@link DataBinder.activateDataBinding}.
	 *
	 * @returns The userData, or undefined if it wasn't specified during activation.
	 */
	getUserData(): any | undefined {
		return this._activationInfo.userData;
	}

	/**
	 * Increment the reference count for this databinding. Databindings can be activated from
	 * multiple paths, however they will only be created once.
	 *
	 * @returns the new reference count
	 * @hidden
	 */
	_incReferenceCount(): number {
		return ++this._referenceCount;
	}

	/**
	 * Return the reference count on this databinding.
	 *
	 * @returns the reference count
	 * @hidden
	 */
	_getReferenceCount(): number {
		return this._referenceCount;
	}

	/**
	 * Decrement the reference count for this databinding. Databindings can be activated from
	 * multiple paths, however they will only be created once.
	 *
	 * @returns the new reference count
	 * @hidden
	 */
	_decReferenceCount(): number {
		return --this._referenceCount;
	}

	/**
	 * Returns the property for which this DataBinding was instantiated.
	 *
	 * @returns The corresponding property.
	 */
	getProperty(): BaseProperty | undefined {
		return this._property;
	}

	/**
	 * Returns a string that represents the binding type. This was specified when the DataBinding was
	 * registered with the DataBinder using {@link DataBinder.activateDataBinding}.
	 *
	 * @returns The binding type of this DataBinding.
	 */
	getDataBindingType(): string {
		return this._activationInfo.bindingType;
	}

	/**
	 * Returns the DataBinder instance associated with this DataBinding.
	 *
	 * @returns The DataBinder instance.
	 */
	getDataBinder(): DataBinder {
		return this._activationInfo.dataBinder;
	}

	/**
	 * Returns the Property Element at the tokenized path supplied. The path is assumed to be absolute, or relative
	 * from the Property corresponding to this DataBinding. If the Property is already deleted it returns
	 * undefined.
	 *
	 * @param in_tokenizedPath - the tokenized sub-path / absolute path
	 * @param in_resolveReference - default true; if true, resolve the leaf reference if applicable
	 * @returns the property at the sub-path (or undefined).
	 * @package
	 * @hidden
	 */
	getPropertyElementForTokenizedPath(
		in_tokenizedPath: string[],
		in_resolveReference = true,
	): PropertyElement {
		const element = new PropertyElement(this._property);
		if (element.isValid()) {
			element.becomeChild(
				in_tokenizedPath,
				in_resolveReference === false ? RESOLVE_NO_LEAFS : RESOLVE_ALWAYS,
			);
		}
		return element;
	}

	/**
	 * Handler that is called during the initial creation of the DataBinding, once all its children have been
	 * created. Can be overridden by inheriting classes to react to changes to a property that has just been
	 * created. The onPostCreate is called after all children properties have been visited. To react to
	 * a property insertion before the children are visited, add logic to the DataBinding constructor.
	 *
	 * The base class implementation should _not_ be called by inheriting classes.
	 *
	 * @param _in_modificationContext - A context object describing the modification.
	 */
	onPostCreate(_in_modificationContext: ModificationContext) {
		console.warn(
			"Calling base class onPostCreate is deprecated; the call is no longer needed",
		);
	}

	/**
	 * @param _in_modificationContext - The modifications
	 * @hidden
	 */
	_onPostCreate(_in_modificationContext: ModificationContext) {}

	/**
	 * @param in_modificationContext - The modifications
	 * @hidden
	 * @private
	 */
	_invokeInsertCallbacks(in_modificationContext: ModificationContext) {
		if (this._registeredPaths) {
			if (!in_modificationContext.isSimulated()) {
				this._forEachPrototypeMember("_registeredPaths", (in_registeredPaths) => {
					this._handleModifications(
						in_modificationContext,
						in_registeredPaths,
						this._referencePropertyTable,
						false /* called for reference */,
						this._property,
						undefined,
						0,
						undefined,
						[],
					);
				});
			} else {
				// We got a (forced) insert event, so we should call all registered insert handlers
				this._forEachPrototypeMember("_registeredPaths", (in_registeredPaths) => {
					this._invokeInsertCallbacksForPaths(
						[],
						in_registeredPaths,
						this._property!,
						true,
						true,
					);
				});
			}
		}
	}

	/**
	 * Handler that is called when this data binding's corresponding property or any of its child properties are modified.
	 * This function will be called before any of the children's onPreModify and onModify handlers.
	 *
	 * The base class implementation should _not_ be called by inheriting classes.
	 *
	 * @param in_modificationContext - A context object describing the modification.
	 */
	onPreModify(in_modificationContext: ModificationContext) {
		console.warn("Calling base class onPreModify is deprecated; the call is no longer needed");
	}

	/**
	 * @param in_modificationContext - The modifications
	 * @hidden
	 */
	_onPreModify(in_modificationContext: ModificationContext) {}

	/**
	 * Handler that is called when this data binding's corresponding property or any of its child properties are modified.
	 * This function will be called after all of the children's onPreModify and onModify handlers.
	 *
	 * The base class implementation should _not_ be called by inheriting classes.
	 *
	 * @param n_modificationContext - A context object describing the modification.
	 */
	onModify(in_modificationContext: ModificationContext) {
		console.warn("Calling base class onModify is deprecated; the call is no longer needed");
	}

	/**
	 * @param in_modificationContext - The modifications
	 * @hidden
	 */
	_onModify(in_modificationContext: ModificationContext) {}

	/**
	 * @param in_modificationContext - The modifications
	 * @hidden
	 */
	_invokeModifyCallbacks(in_modificationContext: ModificationContext) {
		if (this._registeredPaths) {
			this._forEachPrototypeMember("_registeredPaths", (in_registeredPaths) => {
				this._handleModifications(
					in_modificationContext,
					in_registeredPaths,
					this._referencePropertyTable,
					false /* called for reference */,
					this._property,
					undefined,
					0,
					undefined,
					[],
				);
			});
		}
	}

	/**
	 * Handler that is called when the data binding is removed.
	 * This is called before any of the children's onRemove and onPreRemove handlers are called.
	 *
	 * The base class implementation should _not_ be called by inheriting classes.
	 *
	 * @param _in_removalContext - A context object describing the removal event.
	 */
	onPreRemove(_in_removalContext: RemovalContext) {
		console.warn("Calling base class onPreRemove is deprecated; the call is no longer needed");
	}

	/**
	 * @param _in_removalContext - The removal context
	 * @hidden
	 */
	_onPreRemove(_in_removalContext: RemovalContext) {
		this._property = undefined;
	}

	/**
	 * @param in_tokenizedAbsolutePath - starting absolute path
	 * @param in_simulated - are we pretending something is being removed, or is it for realz?
	 * @hidden
	 * @private
	 */
	_invokeRemoveCallbacks(
		in_tokenizedAbsolutePath: (string | number)[],
		in_simulated: boolean,
	) {
		if (this._registeredPaths) {
			this._forEachPrototypeMember("_registeredPaths", (in_registeredPaths) => {
				this._handleRemovals(
					in_tokenizedAbsolutePath,
					in_registeredPaths,
					this._referencePropertyTable,
					0,
					{
						simulated: in_simulated,
						calledForReferenceTargetChanged: false,
						removeRootCallbacks: true,
						callRootRemovals: false,
						callRemovals: true,
					},
				);
			});
		}
	}

	/**
	 * Handler that is called when the data binding is removed.
	 * This is called after all the children's onRemove and onPreRemove handlers are called.
	 *
	 * The base class implementation should _not_ be called by inheriting classes.
	 *
	 * @param _in_removalContext - A context object describing the removal event.
	 */
	onRemove(_in_removalContext: RemovalContext) {
		console.warn("Calling base class onRemove is deprecated; the call is no longer needed");
	}

	/**
	 * @param in_removalContext - The removal context
	 * @hidden
	 */
	_onRemove(in_removalContext: RemovalContext) {}

	/**
	 * Registers callbacks for all reference properties below the given root property for
	 * which a registered path exists
	 *
	 * @param in_rootProperty       - The root property where the registration starts
	 * @param in_registeredSubPaths - The paths for which the user has registered handlers
	 *                                                             (this structure has to start at the same root as
	 *                                                             in_rootProperty)
	 * @param in_tokenizedFullPath -
	 *     The full path from the DataBinding to this reference (including resolved previous references)
	 * @param  in_registrySubPath    - Path from the root of the reference registry to the
	 *                                                             current node
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that starts at the same root as in_registrySubPath
	 * @param in_indirectionsAtRoot - The number of indirections at the root of the
	 *     the in_referencePropertySubTable
	 * @param in_previousSourceReferencePropertyInfo -
	 *     This contains the reference property table entry for the referencing property. It's used to validate whether
	 *     the currently followed reference chain is still valid.
	 * @param in_retroactiveRegister - if false (the default), disable the just-created handler until the end
	 *     of processing of the current ChangeSet. When registering retroactively, there is no changeset, and the handler
	 *     should be invoked immediately.
	 * @hidden
	 */
	_registerCallbacksForReferenceProperties(
		in_rootProperty: BaseProperty,
		in_registeredSubPaths: any,
		in_tokenizedFullPath: (string | number)[],
		in_registrySubPath: (string | number)[],
		in_referencePropertySubTable: any,
		in_indirectionsAtRoot: number,
		in_previousSourceReferencePropertyInfo: any,
		in_retroactiveRegister = false,
	) {
		if (PropertyFactory.instanceOf(in_rootProperty, "Reference", "single")) {
			this._registerCallbacksForSingleReferenceProperty(
				in_registrySubPath,
				in_tokenizedFullPath,
				in_registeredSubPaths,
				in_referencePropertySubTable,
				in_indirectionsAtRoot,
				in_rootProperty as ReferenceProperty,
				in_previousSourceReferencePropertyInfo,
				in_retroactiveRegister,
				undefined,
			);
		} else if (
			PropertyFactory.instanceOf(in_rootProperty, "Reference", "map") ||
			PropertyFactory.instanceOf(in_rootProperty, "Reference", "array")
		) {
			throw new Error("Not yet implemented");
		} else {
			// Recursively register for sub-paths
			let registeredKeys = _.keys(in_registeredSubPaths);
			for (let i = 0; i < registeredKeys.length; i++) {
				// Get the key
				let key = registeredKeys[i];
				if (key === "__registeredDataBindingHandlers") {
					continue;
				}

				// Get the corresponding property object - we only go one level deeper so can use NEVER here
				let subProperty = (in_rootProperty as any).get(
					unescapeTokenizedStringForMap(key),
					RESOLVE_NEVER,
				);
				if (!subProperty) {
					continue;
				}

				// Recursively traverse
				in_registrySubPath.push(key);
				this._registerCallbacksForReferenceProperties(
					subProperty,
					in_registeredSubPaths[key],
					in_tokenizedFullPath,
					in_registrySubPath,
					in_referencePropertySubTable,
					0,
					in_previousSourceReferencePropertyInfo,
					in_retroactiveRegister,
				);
				in_registrySubPath.pop();
			}
		}
	}

	/**
	 * helper function to work around a bug in the Property Tree
	 *
	 * @param in_property - the property to dereference
	 * @returns the property at the end of the references, or undefined if there
	 * is none
	 *
	 * @hidden
	 */
	_dereferenceProperty(in_property: BaseProperty): BaseProperty | undefined {
		let property: BaseProperty | undefined = in_property;
		while (property && isReferenceProperty(property)) {
			property = property.get(undefined, RESOLVE_ALWAYS);
		}
		return property;
	}

	/**
	 * Registers the callbacks for a specific reference property. If the reference property exists and represents
	 * a valid reference, it will bind against the references in the referenced property for which handlers have
	 * been registered in the _registeredPaths.
	 *
	 * @param in_tokenizedRegistrySubPath -
	 *     The path in the handler registry for which the reference callbacks are added
	 * @param in_tokenizedFullPath -
	 *     The full path from the data binding to this reference (including resolved previous references)
	 * @param in_registeredSubPaths -
	 *     The paths for which the user has registered handlers
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that starts at the same root as in_tokenizedRegistrySubPath
	 * @param in_indirectionsAtRoot - The number of indirections at the root of the
	 *     the in_referencePropertySubTable
	 * @param in_referenceProperty -
	 *     The property that contains the reference that resulted in this callback.
	 * @param in_previousSourceReferencePropertyInfo -
	 *     This contains the reference property table entry for the referencing property. It's used to validate whether
	 *     the currently followed reference chain is still valid.
	 * @param in_retroactiveRegister - if false (the default), disable the just-created handler until the end
	 *     of processing of the current ChangeSet. When registering retroactively, there is no changeset, and the handler
	 *     should be invoked immediately.
	 * @param in_referenceKey - if provided, in_referenceProperty is assumed to be an array/map of references
	 *     and this parameter is used as key to identify the exact reference.
	 * @hidden
	 */
	private _registerCallbacksForSingleReferenceProperty(
		in_tokenizedRegistrySubPath: (string | number)[],
		in_tokenizedFullPath: (string | number)[],
		in_registeredSubPaths: string[],
		in_referencePropertySubTable: any[],
		in_indirectionsAtRoot: number,
		in_referenceProperty: ReferenceProperty,
		in_previousSourceReferencePropertyInfo: any,
		in_retroactiveRegister = false,
		in_referenceKey?: string,
	) {
		let originalReferencedPath: string | string[];
		const pathToReferenceProperty = in_referenceProperty.getAbsolutePath();
		in_retroactiveRegister = !!in_retroactiveRegister; // default is false!

		// Check in the data-structure, whether there are any registered reference modification callbacks
		// in the path-subtree below the modified reference
		let tokenizedRegistrySubPath: string | any[] | ConcatArray<string>;
		let registeredSubPaths: any = in_registeredSubPaths;

		const referencedElement = new PropertyElement(in_referenceProperty);
		if (in_referenceKey !== undefined) {
			if (registeredSubPaths[in_referenceKey] !== undefined) {
				registeredSubPaths = registeredSubPaths[in_referenceKey];
			}
			tokenizedRegistrySubPath = in_tokenizedRegistrySubPath.concat(in_referenceKey);
			originalReferencedPath = (in_referenceProperty as any).getValue(in_referenceKey);
			referencedElement.becomeChild(in_referenceKey, RESOLVE_NO_LEAFS);
		} else {
			tokenizedRegistrySubPath = in_tokenizedRegistrySubPath;
			originalReferencedPath = in_referenceProperty.getValue();
		}

		// Dereference the reference one hop. Note, the result may be an element of a primitive array!
		referencedElement.becomeDereference(RESOLVE_NO_LEAFS);

		// Compute the final target of the reference, if it exists, in case there are multiple hops.
		let targetElement: PropertyElement;
		if (referencedElement.isValid() && referencedElement.isReference()) {
			// We know referencedProperty resolves at least one hop, but we need to validate that the reference
			// eventually gets to a real property --- there may be a break in the chain of references.
			targetElement = referencedElement.getDereference();
		} else {
			targetElement = referencedElement;
		}
		const targetAbsolutePath = targetElement.isValid()
			? targetElement.getAbsolutePath()
			: undefined;
		let handlerNode = getInNestedObjects.apply(
			this,
			// @ts-ignore
			[in_referencePropertySubTable].concat(
				// @ts-ignore
				escapeTokenizedPathForMap(tokenizedRegistrySubPath),
			),
		);

		if (handlerNode) {
			// Recursively remove all old handlers from the DataBinding tree
			// TODO: handle the case when we have a reference collection with overlapping registeredSubPaths
			const tokenized = PathHelper.tokenizePathString(pathToReferenceProperty);
			tokenized.shift(); // Remove the '/'

			// We fire removals/referenceRemovals _only_ if the path became invalid or changed
			const fireRemovals =
				handlerNode.__registeredData.lastTargetPropAbsPath !== undefined &&
				handlerNode.__registeredData.lastTargetPropAbsPath !== targetAbsolutePath;
			// This will remove existing handlers (_referenceTargetChanged bindings, done below)
			// and simultaneously fire remove/referenceRemoves if fireRemovals.
			this._handleRemovals(tokenized, registeredSubPaths, handlerNode, in_indirectionsAtRoot, {
				simulated: false,
				calledForReferenceTargetChanged: true,
				removeRootCallbacks: true,
				callRootRemovals: true,
				callRemovals: fireRemovals,
			});
		}

		// Insert the handler into the reference property handler data-structure
		if (!handlerNode) {
			handlerNode = getOrInsertDefaultInNestedObjects.apply(
				this,
				// @ts-ignore
				[in_referencePropertySubTable]
					// @ts-ignore
					.concat(escapeTokenizedPathForMap(tokenizedRegistrySubPath))
					// @ts-ignore
					.concat({}),
			);
		}
		initializeReferencePropertyTableNode(handlerNode);

		if (_.isString(originalReferencedPath) && originalReferencedPath !== "") {
			// The original reference was not empty.
			// Compute the final reference path, after taking relative paths into account.
			let finalReferencedPath: string;
			if (originalReferencedPath[0] === "/") {
				// We are referencing an absolute property - optimize this case.
				finalReferencedPath = originalReferencedPath.substr(1);
			} else {
				// The eventual referencedElement may be invalid (it may not exist yet, but we still need to bind to
				// notice when it appears (if it does)).
				// So we need to figure out the absolute path from where our
				// reference property is (taking ".." tokens into account).
				let referencedPathTokenTypes = [];
				let tokenizedReferencedPath = PathHelper.tokenizePathString(
					originalReferencedPath,
					referencedPathTokenTypes,
				);
				let numberOfRaiseLevelTokens = 0;
				let ti: number;
				for (
					ti = 0;
					ti < referencedPathTokenTypes.length &&
					referencedPathTokenTypes[ti] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN;
					++ti
				) {
					numberOfRaiseLevelTokens++;
				}
				for (ti = 0; ti < numberOfRaiseLevelTokens; ++ti) {
					tokenizedReferencedPath.shift();
					referencedPathTokenTypes.shift();
				}
				let absolutePathTokenTypes = [];
				console.assert(in_referenceProperty !== undefined);
				// the path to which the referenced path is relative to is actually the _parent_ of the referenceProperty!
				let absolutePath = in_referenceProperty!.getParent()!.getAbsolutePath().substr(1);
				let tokenizedAbsolutePath = PathHelper.tokenizePathString(
					absolutePath,
					absolutePathTokenTypes,
				);
				// cut off from the end of the absolute path the levels that we traversed upwards
				console.assert(tokenizedAbsolutePath.length >= numberOfRaiseLevelTokens);
				tokenizedAbsolutePath.length = tokenizedAbsolutePath.length - numberOfRaiseLevelTokens;
				absolutePathTokenTypes.length =
					absolutePathTokenTypes.length - numberOfRaiseLevelTokens;
				// concatenate the remainder of the absolute path with the relative path stripped of '..' tokens
				tokenizedReferencedPath = tokenizedAbsolutePath.concat(tokenizedReferencedPath);
				referencedPathTokenTypes = absolutePathTokenTypes.concat(referencedPathTokenTypes);
				finalReferencedPath = concatTokenizedPath(
					tokenizedReferencedPath,
					referencedPathTokenTypes,
					tokenizedReferencedPath.length,
				);
			}

			let typeidHolder: any = {
				typeid: undefined,
			};

			// Register a handler for the _referenced_ property, i.e., the target.
			// This handler will be called every time the target changes. So if I have callbacks along
			// the path a.ref.b.c, that goes through this reference 'ref' and targets X, whenever the target X
			// changes, this function will handle 'finishing the job' for changes in b/c.
			// The function also handles the case where the target is not present, and shows up.
			// The end of this current function recursively binds on the target of the reference, unless
			// the target does not exist.
			// If the target does not exist, this function does not recurse, and inside _referenceTargetChanged,
			// if the target property shows up, it will only then recursively continue the process.
			const modificationCallback = this._referenceTargetChanged.bind(
				this,
				in_registeredSubPaths as any, // Note, the original version, not registeredSubPaths
				in_referencePropertySubTable,
				"/" + finalReferencedPath,
				typeidHolder,
				in_indirectionsAtRoot,
				in_previousSourceReferencePropertyInfo,
				// WARNING: 'in_tokenizedFullPath' is '(string | number)[]'.  The cast to 'string[]'
				//          preserves the JavaScript coercion behavior, which was permitted prior to TS5.
				in_tokenizedFullPath.slice()! as string[],
				tokenizedRegistrySubPath.slice()!,
				in_referenceKey,
			);
			const handle = this.getDataBinder()._registerOnSimplePath(
				finalReferencedPath,
				["insert", "modify", "remove"],
				modificationCallback,
			);
			console.assert(handlerNode.__registeredData.handlers.length === in_indirectionsAtRoot);
			handlerNode.__registeredData.handlers.push(handle);

			// We store a @#$@# of data with the handler. This should be cut down. We store this information so that
			// if the target changes, we can evaluate what changed.
			let sourceReferencePropertyInfo =
				handlerNode.__registeredData.sourceReferencePropertyInfo;
			sourceReferencePropertyInfo[in_indirectionsAtRoot] =
				sourceReferencePropertyInfo[in_indirectionsAtRoot] || {};
			sourceReferencePropertyInfo[in_indirectionsAtRoot].property = in_referenceProperty;
			sourceReferencePropertyInfo[in_indirectionsAtRoot].propertyPath =
				pathToReferenceProperty;
			sourceReferencePropertyInfo[in_indirectionsAtRoot].propertyKey = in_referenceKey;
			sourceReferencePropertyInfo[in_indirectionsAtRoot].referencedPath =
				originalReferencedPath;
			sourceReferencePropertyInfo[in_indirectionsAtRoot].previousInfo =
				in_previousSourceReferencePropertyInfo;

			if (!in_retroactiveRegister) {
				// We create the handler in a disabled state, since after a change of a reference,
				// we don't yet want to get events for the referenced properties. Only after processing this scope has
				// finished, the handler is re-enabled and thus events on the referenced properties are processed.
				sourceReferencePropertyInfo[in_indirectionsAtRoot].disabled = true;
				this.getDataBinder().requestChangesetPostProcessing(function (this: any) {
					this.disabled = false; // @TODO: To remove because most likely it's not used
				}, sourceReferencePropertyInfo[in_indirectionsAtRoot]);
			} else {
				// we are retroactively handling a binding and there is no ChangeSet, so we immediately enable the handler
				sourceReferencePropertyInfo[in_indirectionsAtRoot].disabled = false;
			}

			// here, if there was previously no target, lastTargetPropAbsPath is undefined.
			if (targetAbsolutePath !== handlerNode.__registeredData.lastTargetPropAbsPath) {
				// We are targetting a new property --- send insert notifications
				handlerNode.__registeredData.lastTargetPropAbsPath = targetAbsolutePath;
				const pathRelativeToBaseBinding = in_tokenizedFullPath.concat(
					tokenizedRegistrySubPath,
				);
				this._invokeInsertCallbacksForPaths(
					pathRelativeToBaseBinding,
					registeredSubPaths,
					targetElement.getProperty()!,
					in_retroactiveRegister,
					false,
				);
			}

			// TODO: handle referencedElement being a collection of primitive elements.
			if (referencedElement.isValid() && !referencedElement.isPrimitiveCollectionElement()) {
				typeidHolder.typeid = referencedElement.getTypeId();

				this._registerCallbacksForReferenceProperties(
					referencedElement.getProperty()!,
					registeredSubPaths,
					in_tokenizedFullPath,
					tokenizedRegistrySubPath,
					in_referencePropertySubTable,
					in_indirectionsAtRoot + 1,
					sourceReferencePropertyInfo[in_indirectionsAtRoot],
					in_retroactiveRegister,
				);
			}
		}
	}

	/**
	 * Callback that is invoked, if a reference has been changed
	 *
	 * @param in_registeredSubPaths -
	 *     The paths for which the user has registered handlers (this structure has to be rooted at the
	 *     modified reference)
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that is rooted at the modified reference
	 * @param in_rootPath - The path to which this handler is bound
	 * @param in_rootTypeidHolder -
	 *     Object holding the full typeid of the Property at the root of the currently processed ChangeSet
	 * @param in_indirectionsAtRoot - The number of indirections at the root of the
	 *     the in_referencePropertySubTable
	 * @param in_previousSourceReferencePropertyInfo -
	 *     This contains the reference property table entry for the referencing property. It's used to validate whether
	 *     the currently followed reference chain is still valid.
	 * @param in_tokenizedFullPath -
	 *     The full path from the data binding to this reference (including resolved previous references)
	 * @param in_tokenizedRegistrySubPath -
	 * @param in_referenceKey - if provided, in_referenceProperty is assumed to be an array/map of references
	 *     and this parameter is used as key to identify the exact reference.
	 * @param in_modificationContext -
	 *     The modifications / removal information for the reference
	 * @hidden
	 */
	private _referenceTargetChanged(
		in_registeredSubPaths: any,
		in_referencePropertySubTable: any,
		in_rootPath: string,
		in_rootTypeidHolder: any,
		in_indirectionsAtRoot: number,
		in_previousSourceReferencePropertyInfo: any,
		in_tokenizedFullPath: Array<string>,
		in_tokenizedRegistrySubPath: string[],
		in_referenceKey?: string,
		in_modificationContext?: ModificationContext | RemovalContext,
	) {
		const handlerNode = getOrInsertDefaultInNestedObjects.apply(
			this,
			// @ts-ignore
			[in_referencePropertySubTable]
				.concat(escapeTokenizedPathForMap(in_tokenizedRegistrySubPath))
				.concat({}),
		) as any;

		if (handlerNode.__registeredData.sourceReferencePropertyInfo) {
			let sourceReferencePropertyInfo =
				handlerNode.__registeredData.sourceReferencePropertyInfo[in_indirectionsAtRoot];

			while (sourceReferencePropertyInfo !== undefined) {
				let referencedPath =
					sourceReferencePropertyInfo.propertyKey !== undefined
						? sourceReferencePropertyInfo.property.getValue(
								sourceReferencePropertyInfo.propertyKey,
							)
						: sourceReferencePropertyInfo.property.getValue();
				if (
					sourceReferencePropertyInfo.property.getAbsolutePath() !==
						sourceReferencePropertyInfo.propertyPath ||
					referencedPath !== sourceReferencePropertyInfo.referencedPath ||
					sourceReferencePropertyInfo.disabled
				) {
					return;
				}
				sourceReferencePropertyInfo = sourceReferencePropertyInfo.previousInfo;
			}
		}
		let registeredSubPaths = in_registeredSubPaths;
		if (in_referenceKey !== undefined && registeredSubPaths[in_referenceKey] !== undefined) {
			registeredSubPaths = registeredSubPaths[in_referenceKey];
		}

		// Recursively invoke the path handlers for the referenced property
		if (in_modificationContext instanceof ModificationContext) {
			// TODO: will we always have a property here even for references that point to not-yet-existing paths?
			if (in_modificationContext.getOperationType() === "insert") {
				// The property we point to finally exists.
				// If this code looks familiar, it is because it is a version of the end of
				// _registerCallbacksForSingleReferenceProperty.
				const targetProp = this._property!.getRoot().resolvePath(in_rootPath, RESOLVE_NEVER)!;
				const eventualProp = this._dereferenceProperty(targetProp);

				in_rootTypeidHolder.typeid = targetProp.getFullTypeid();

				if (eventualProp) {
					handlerNode.__registeredData.lastTargetPropAbsPath = eventualProp.getAbsolutePath();
				}

				const pathRelativeToBaseBinding = in_tokenizedFullPath.concat(
					in_tokenizedRegistrySubPath,
				);
				this._invokeInsertCallbacksForPaths(
					pathRelativeToBaseBinding,
					registeredSubPaths,
					targetProp,
					false,
					false,
				);
				this._registerCallbacksForReferenceProperties(
					targetProp,
					registeredSubPaths,
					in_tokenizedFullPath,
					in_tokenizedRegistrySubPath,
					in_referencePropertySubTable,
					in_indirectionsAtRoot + 1,
					handlerNode.__registeredData.sourceReferencePropertyInfo[in_indirectionsAtRoot],
					false,
				);
			} else {
				this._handleModifications(
					in_modificationContext,
					registeredSubPaths,
					handlerNode,
					true /* called for reference target changed */,
					in_rootPath,
					in_rootTypeidHolder,
					in_indirectionsAtRoot,
					in_previousSourceReferencePropertyInfo,
					in_tokenizedFullPath.concat(in_tokenizedRegistrySubPath),
				);
			}
		} else {
			// then it is a removalContext
			const removalContext = in_modificationContext!;
			const tokenizedAbsolutePath = PathHelper.tokenizePathString(
				removalContext.getAbsolutePath(),
			);
			in_rootTypeidHolder.typeid = undefined;

			// Target of a reference is being removed, we call any removal callbacks for
			// the subtree of callbacks that start here. We then also tear down the handles
			// in the subtree.
			// We don't remove the handlers at the root (the handler that just called us!)
			// since we will still want to hear about it being reinserted
			this._handleRemovals(
				tokenizedAbsolutePath,
				registeredSubPaths,
				handlerNode,
				in_indirectionsAtRoot,
				{
					simulated: false,
					calledForReferenceTargetChanged: true,
					// don't remove any handlers on the root - we will still want to be notified if it gets added again
					removeRootCallbacks: false,
					callRootRemovals: true,
					callRemovals: true,
				},
			);
		}
	}

	/**
	 * This function will handle additional bookkeeping necessary when encountering a reference Property during
	 * handling modifications.
	 *
	 * @param in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
	 * @param in_previousSourceReferencePropertyInfo -
	 *     This contains the reference property table entry for the referencing property. It's used to validate whether
	 *     the currently followed reference chain is still valid.
	 * @param in_context - Traversal context
	 * @param in_nestedRegisteredPath -
	 *     The paths for which the user has registered handlers (this structure has to be rooted at the
	 *     same property as the modification context)
	 * @param in_tokenizedPath - The (relative) path from the data binding
	 *     to the current traversal position (including resolved previous references)
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that is rooted at the same property as the modification context
	 * @param in_calledForReferenceTargetChanged -
	 *     This handler was called due to the target of a reference changing
	 * @param in_rootPathOrProperty -
	 *     Either the property at which the changeSet processed by this function is rooted, or alternatively
	 *     a path to this property. This will be used to resolve other paths.
	 * @param in_tokenizedFullPath -
	 *     The full path from the data binding to the current position (including resolved previous references)
	 * @hidden
	 */
	_handleReferenceModifications(
		in_indirectionsAtRoot: number,
		in_previousSourceReferencePropertyInfo: any,
		in_context: Utils.TraversalContext,
		in_nestedRegisteredPath: any,
		in_tokenizedPath: (string | number)[],
		in_referencePropertySubTable: any,
		in_calledForReferenceTargetChanged: boolean,
		in_rootPathOrProperty: string,
		in_tokenizedFullPath: Array<string>,
	) {
		let level = in_tokenizedPath.length === 0 ? in_indirectionsAtRoot + 1 : 0;
		let that = this;
		let operationType = in_context.getOperationType();
		let k: number;

		if (operationType === "insert" || operationType === "modify") {
			let rootProperty: BaseProperty;
			if (_.isString(in_rootPathOrProperty)) {
				rootProperty = (this._property as ReferenceProperty).resolvePath(
					in_rootPathOrProperty,
					RESOLVE_NO_LEAFS,
				)!;
			} else {
				rootProperty = in_rootPathOrProperty;
			}
			let collectionKeys: string | any[], currentKey: any;
			let referenceProperty = (rootProperty as any).get(in_tokenizedPath, RESOLVE_NO_LEAFS);
			let nestedChangeSet = in_context.getNestedChangeSet();
			let referenceInformation: any, nestedRegisteredPath: any;
			const tokenizedAbsolutePath: any = PathHelper.tokenizePathString(
				referenceProperty.getAbsolutePath(),
			);
			tokenizedAbsolutePath.shift(); // Remove the '/'

			if (in_context.getSplitTypeID().context === "single") {
				// TODO: Should we do a parallel traversal here?
				this._registerCallbacksForSingleReferenceProperty(
					in_tokenizedPath,
					in_tokenizedFullPath,
					in_nestedRegisteredPath,
					in_referencePropertySubTable,
					level,
					referenceProperty,
					in_previousSourceReferencePropertyInfo,
					false, // not registering retroactively
					undefined,
				);
			} else if (in_context.getSplitTypeID().context === "map") {
				let processNestedChangeSet = function (in_nestedChangeSet: any) {
					// reference types are always primitive types so our loop can be simpler
					collectionKeys = _.keys(in_nestedChangeSet);
					for (k = 0; k < collectionKeys.length; k++) {
						currentKey = collectionKeys[k];
						that._registerCallbacksForSingleReferenceProperty(
							in_tokenizedPath,
							in_tokenizedFullPath,
							in_nestedRegisteredPath,
							in_referencePropertySubTable,
							level,
							referenceProperty,
							in_previousSourceReferencePropertyInfo,
							false, // not registering retroactively
							currentKey,
						);
					}
				};
				let processNestedChangeSetRemove = function (in_nestedChangeSet: string | any[]) {
					// reference types are always primitive types so our loop can be simpler
					for (k = 0; k < in_nestedChangeSet.length; k++) {
						currentKey = in_nestedChangeSet[k];
						referenceInformation = getInNestedObjects.apply(
							undefined,
							// @ts-ignore
							[in_referencePropertySubTable].concat(
								// @ts-ignore
								escapeTokenizedPathForMap(in_tokenizedPath.concat(currentKey)),
							),
						);
						// we only need to call _handleRemovals if we actually had a reference there (we might have deleted
						// an "empty" reference from the map in which case we don't need to do anything
						if (referenceInformation) {
							nestedRegisteredPath = in_nestedRegisteredPath[currentKey]
								? in_nestedRegisteredPath[currentKey]
								: in_nestedRegisteredPath;
							tokenizedAbsolutePath.push(currentKey);
							that._handleRemovals(
								tokenizedAbsolutePath,
								nestedRegisteredPath,
								referenceInformation,
								level,
								{
									simulated: false,
									calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
									removeRootCallbacks: true,
									callRootRemovals: false,
									callRemovals: true,
								},
							);
							tokenizedAbsolutePath.pop();
						}
					}
				};
				if (nestedChangeSet.insert) {
					processNestedChangeSet(nestedChangeSet.insert);
				}
				if (nestedChangeSet.modify) {
					processNestedChangeSet(nestedChangeSet.modify);
				}
				if (nestedChangeSet.remove) {
					processNestedChangeSetRemove(nestedChangeSet.remove);
				}
			} else if (in_context.getSplitTypeID().context === "array") {
				let arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
				let index: string | number | ConcatArray<string> | undefined, i: number;
				while (!arrayIterator.atEnd()) {
					switch (arrayIterator.opDescription.type) {
						case ArrayChangeSetIterator.types.INSERT:
						case ArrayChangeSetIterator.types.MODIFY:
							for (i = 0; i < arrayIterator.opDescription.operation![1].length; ++i) {
								index =
									arrayIterator.opDescription.operation![0] +
									i +
									arrayIterator.opDescription.offset!;
								this._registerCallbacksForSingleReferenceProperty(
									in_tokenizedPath,
									in_tokenizedFullPath,
									in_nestedRegisteredPath,
									in_referencePropertySubTable,
									level,
									referenceProperty,
									in_previousSourceReferencePropertyInfo,
									false, // not registering retroactively
									index as any,
								);
							}
							break;
						case ArrayChangeSetIterator.types.REMOVE:
							for (
								i = 0;
								// WARNING: 'operation[1]' is 'string | number | genericArray'.  The cast to 'number'
								//          preserves the JavaScript coercion behavior, which was permitted prior to TS5.
								i < (arrayIterator.opDescription.operation![1] as number);
								++i
							) {
								// We don't have a changeset for this. Since we assume that the previous elements have already
								// been removed, we don't add the range index i in this call
								// Provide context (even w/o a valid changeset) to make writing callbacks easier
								index =
									arrayIterator.opDescription.operation![0] +
									arrayIterator.opDescription.offset!;
								referenceInformation = getInNestedObjects.apply(
									undefined,
									// @ts-ignore
									[in_referencePropertySubTable].concat(
										// @ts-ignore
										escapeTokenizedPathForMap(in_tokenizedPath.concat(index)),
									),
								);
								// we only need to call _handleRemovals if we actually had a reference there (we might have deleted
								// an "empty" reference from the array in which case we don't need to do anything
								if (referenceInformation) {
									nestedRegisteredPath = in_nestedRegisteredPath[index]
										? in_nestedRegisteredPath[index]
										: in_nestedRegisteredPath;
									tokenizedAbsolutePath.push(arrayIterator.opDescription.offset!);
									this._handleRemovals(
										tokenizedAbsolutePath,
										nestedRegisteredPath,
										referenceInformation,
										level,
										{
											simulated: false,
											calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
											removeRootCallbacks: true,
											callRootRemovals: false,
											callRemovals: true,
										},
									);
									tokenizedAbsolutePath.pop();
								}
							}
							break;
						default:
							throw new Error(
								"ArrayChangeSetIterator: unknown operator " + arrayIterator.opDescription.type,
							);
					}
					arrayIterator.next();
				}
			} else {
				throw new Error("unknown reference context: " + in_context.getSplitTypeID().context);
			}
		} else {
			// Otherwise the removal of a reference
			let referenceInformation = getInNestedObjects.apply(
				undefined,
				// @ts-ignore
				[in_referencePropertySubTable].concat(escapeTokenizedPathForMap(in_tokenizedPath)),
			);
			if (referenceInformation) {
				this._handleRemovals(
					in_tokenizedFullPath,
					in_nestedRegisteredPath,
					referenceInformation,
					level,
					{
						simulated: false,
						calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
						removeRootCallbacks: true,
						callRootRemovals: false,
						callRemovals: true,
					},
				);
			}
		}
	}

	/**
	 * This function will call the insert, modify and collection* callbacks registered via DataBinding.registerOnPath()
	 * with the appropriate arguments. Additionally, it will take care of binding callbacks to reference properties
	 * to keep track of changes to referenced properties (if a path handler has been registered that traverses the
	 * reference).
	 *
	 * @param in_modificationContext -
	 *     The modifications
	 * @param in_registeredSubPaths -
	 *     The paths for which the user has registered handlers (this structure has to be rooted at the
	 *     same property as the modification context)
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that is rooted at the same property as the modification context
	 * @param in_calledForReferenceTargetChanged -
	 *     This handler was called due to the target of a reference changing
	 * @param in_rootPathOrProperty -
	 *     Either the property at which the changeSet processed by this function is rooted, or alternatively
	 *     a path to this property. This will be used to resolve other paths.
	 * @param in_referencedPropertyTypeidHolder -
	 *     Object containing full typeid of the referenced object (including context).
	 * @param in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
	 * @param in_previousSourceReferencePropertyInfo -
	 *     This contains the reference property table entry for the referencing property. It's used to validate whether
	 *     the currently followed reference chain is still valid.
	 * @param in_tokenizedFullPath -
	 *     The full path from the Data Binding to the current position (including resolved previous references)
	 * @hidden
	 */
	private _handleModifications(
		in_modificationContext: ModificationContext,
		in_registeredSubPaths: { [key: string]: any },
		in_referencePropertySubTable: any,
		in_calledForReferenceTargetChanged: boolean,
		in_rootPathOrProperty: any,
		in_referencedPropertyTypeidHolder: any | undefined,
		in_indirectionsAtRoot: number,
		in_previousSourceReferencePropertyInfo: any,
		in_tokenizedFullPath: string[],
	) {
		let rootTypeid = in_referencedPropertyTypeidHolder
			? in_referencedPropertyTypeidHolder.typeid
			: in_rootPathOrProperty.getFullTypeid();

		// _globalVisitIndex is to avoid callbacks being called twice. This works around bugs in getChangesToTokenizedPaths
		// which may visit properties with multiple nested changes several times
		const tokenizedPathCallback = (invokeCallbacks as any).bind(
			undefined,
			this,
			in_modificationContext,
			in_calledForReferenceTargetChanged,
			in_tokenizedFullPath,
			++_globalVisitIndex,
		);
		Utils.getChangesToTokenizedPaths(
			in_registeredSubPaths,
			in_modificationContext.getNestedChangeSet(),
			function (
				this: DataBinding,
				in_context,
				in_currentSubPaths,
				in_currentTokenizedPath,
				in_contractedSegment,
			) {
				const operationType = in_context.getOperationType();
				if (operationType !== "remove") {
					const isReference = TypeIdHelper.isReferenceTypeId(
						in_context.getSplitTypeID().typeid,
					);
					if (isReference && !in_contractedSegment) {
						this._handleReferenceModifications(
							in_indirectionsAtRoot,
							in_previousSourceReferencePropertyInfo,
							in_context,
							in_currentSubPaths,
							in_currentTokenizedPath,
							in_referencePropertySubTable,
							in_calledForReferenceTargetChanged,
							in_rootPathOrProperty,
							in_tokenizedFullPath,
						);
					}
					tokenizedPathCallback(
						in_context,
						in_currentSubPaths.__registeredDataBindingHandlers,
						in_currentTokenizedPath,
						isReference,
					);
				} else {
					// getChangesToTokenizedPaths recursion stops here -- finish the recursion for 'remove'
					// Check, whether we have registered a reference processing handler for this path
					// In that case it is a reference.
					const that = this;
					const visitor = function (
						in_subpathEntry,
						in_referenceEntry: any | undefined,
						in_tokenizedPath: any[],
					) {
						const isReference =
							in_referenceEntry &&
							in_referenceEntry.__registeredData &&
							in_referenceEntry.__registeredData.handlers;
						if (isReference) {
							that._handleReferenceModifications(
								in_indirectionsAtRoot,
								in_previousSourceReferencePropertyInfo,
								in_context,
								in_subpathEntry,
								in_tokenizedPath,
								in_referencePropertySubTable,
								in_calledForReferenceTargetChanged,
								in_rootPathOrProperty,
								in_tokenizedFullPath,
							);
						}
						if (in_subpathEntry.__registeredDataBindingHandlers) {
							tokenizedPathCallback(
								in_context,
								in_subpathEntry.__registeredDataBindingHandlers,
								in_tokenizedPath,
								isReference,
							);
						}
						// Recurse if it is not a reference. References are handled _referenceTargetChanged
						if (!isReference) {
							_.each(in_subpathEntry, function (in_child, in_childName) {
								if (in_childName !== "__registeredDataBindingHandlers") {
									in_tokenizedPath.push(in_childName);
									visitor(
										in_child,
										in_referenceEntry ? in_referenceEntry[in_childName] : undefined,
										in_tokenizedPath,
									);
									in_tokenizedPath.pop();
								}
							});
						}
					};
					const startingRefEntry = getInNestedObjects.apply(
						this,
						// @ts-ignore
						[in_referencePropertySubTable].concat(
							escapeTokenizedPathForMap(in_currentTokenizedPath),
						),
					);
					visitor(in_currentSubPaths, startingRefEntry, in_currentTokenizedPath);
				}
			}.bind(this),
			{
				rootOperation: in_modificationContext.getOperationType()!,
				rootTypeid: rootTypeid,
				escapeLeadingDoubleUnderscore: true,
			},
		);
	}

	/**
	 * This function will call the remove / referenceRemove callbacks registered via DataBinding.registerOnPath() with
	 * the appropriate arguments. Additionally, it will take care of unbinding callbacks to reference properties
	 * to keep track of changes to referenced properties (if a path handler has been registered that traverses the
	 * reference)
	 *
	 * @param in_tokenizedAbsolutePath - the tokenized absolute path for the portion of the
	 *     tree we are dealing with.
	 * @param in_registeredSubPaths -
	 *     The paths for which the user has registered handlers (this structure has to be rooted at the
	 *     same property as the removal context)
	 * @param in_referencePropertySubTable -
	 *     The subtree of the reference property table that is rooted at the same property as the removal context
	 * @param in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
	 * @param in_options - options for the removal
	 * @param in_options.simulated - removals are simulated
	 * @param in_options.calledForReferenceTargetChanged -
	 *     Was this handler indirectly called by a _referenceTargetChanged handler
	 * @param in_options.removeRootCallbacks -
	 *     Should any reference target handlers at the root of the tree also be removed?
	 * @param in_options.callRootRemovals -
	 *     Should we fire removals for the root of the tree?
	 * @param in_options.callRemovals - fire removal callbacks where appropriate. Otherwise, just tear down
	 *     the handles
	 * @private
	 * @hidden
	 */
	_handleRemovals(
		in_tokenizedAbsolutePath: (string | number)[],
		in_registeredSubPaths: string,
		in_referencePropertySubTable: any,
		in_indirectionsAtRoot: number,
		in_options: DataBindingOptions,
	) {
		this._handleRemovalsInternal(
			in_tokenizedAbsolutePath,
			in_registeredSubPaths,
			in_referencePropertySubTable,
			in_indirectionsAtRoot,
			in_options.simulated,
			in_options.calledForReferenceTargetChanged!,
			in_options.removeRootCallbacks!,
			in_options.callRootRemovals!,
			in_options.callRemovals!,
			true,
		);
	}

	/**
	 * Implementation of handleRemovals. Wrapper is just to have a default value for in_isRoot and keep
	 * _handleRemovals a wee bit cleaner.
	 *
	 * @inheritdoc _handleRemovals
	 * @hidden
	 */
	_handleRemovalsInternal(
		in_tokenizedAbsolutePath: (string | number)[],
		in_registeredSubPaths: any,
		in_referencePropertySubTable: any,
		in_indirectionsAtRoot: number,
		in_simulated: boolean | undefined,
		in_calledForReferenceTargetChanged: boolean,
		in_removeRootCallbacks: boolean,
		in_callRootRemovals: boolean,
		in_callRemovals: boolean,
		in_isRoot: boolean,
	) {
		// We got a remove event, so we should call all registered remove handlers
		const dataBindingHandlers = in_registeredSubPaths
			? in_registeredSubPaths.__registeredDataBindingHandlers
			: undefined;
		const registeredData = in_referencePropertySubTable
			? in_referencePropertySubTable.__registeredData
			: undefined;

		// Check, whether we have registered a reference processing handler (a bound _referenceTargetChanged) for this
		// path. If there is one, we are currently considering a property that is/was a reference.
		const isReference = registeredData && registeredData.handlers;

		// We had a valid reference if it was a reference and it had a valid path
		const hadValidReference = isReference && !!registeredData.lastTargetPropAbsPath;

		// We fire callbacks for this node unless the caller has requested to not call for the root
		const fireForThisNode = in_callRemovals && in_callRootRemovals;
		const removeHandlersForThisNode = !in_isRoot || in_removeRootCallbacks;

		if (fireForThisNode && dataBindingHandlers) {
			// We want to bind to the reference property and not the referenced property
			// So if this is invoked for a reference and we are at the root of the
			// sub-tree, then this is not the reference property, but the referenced property
			const invokeReferenceRemove =
				!in_calledForReferenceTargetChanged || (!in_isRoot && isReference);

			// Call remove handlers bound directly to the node
			if (
				dataBindingHandlers.remove ||
				(invokeReferenceRemove && dataBindingHandlers.referenceRemove)
			) {
				const tree = this.getDataBinder()._dataBindingTree;
				const node = tree.getNodeForTokenizedPath(in_tokenizedAbsolutePath);
				if (node) {
					const path = tree.generatePathFromTokens(in_tokenizedAbsolutePath);
					const removalContext = new RemovalContext(node, this, path!, in_simulated);
					if (dataBindingHandlers.remove) {
						for (let j = 0; j < dataBindingHandlers.remove.length; j++) {
							dataBindingHandlers.remove[j].pathCallback.call(this, removalContext);
						}
					}
					if (invokeReferenceRemove && dataBindingHandlers.referenceRemove) {
						for (let j = 0; j < dataBindingHandlers.referenceRemove.length; j++) {
							dataBindingHandlers.referenceRemove[j].pathCallback.call(this, removalContext);
						}
					}
				}
			}
		}

		// Unregister callbacks bound to the node. These are all callbacks to _referenceTargetChanged
		if (removeHandlersForThisNode && registeredData) {
			// We have a registered handler for this node
			if (registeredData.handlers) {
				for (let i = in_indirectionsAtRoot; i < registeredData.handlers.length; i++) {
					registeredData.handlers[i].destroy();
				}
				registeredData.handlers = registeredData.handlers.slice(0, in_indirectionsAtRoot);
			}
		}

		let recursiveBasePath = in_tokenizedAbsolutePath;
		if (hadValidReference) {
			// Valid reference; recurse on the _referenced_ property
			recursiveBasePath = PathHelper.tokenizePathString(registeredData.lastTargetPropAbsPath);
			recursiveBasePath.shift();
		}

		// Recursively, we will continue to call removal callbacks if the caller asked us to. However, we
		// stop calling the remove callbacks recursivley if we come to an invalid reference; if it was
		// an invalid reference, the inserts were not called so we shouldn't call the removals.

		// e.g., if there is a remove callback on bob.ref.joe, we don't want to call the callback
		// if 'ref' is invalid.
		const recursiveCallRemovals = in_callRemovals && (!isReference || hadValidReference);

		const keys = _.keys(in_registeredSubPaths);
		for (let i = 0; i < keys.length; i++) {
			if (keys[i] !== "__registeredDataBindingHandlers" && keys[i] !== "__registeredData") {
				recursiveBasePath.push(keys[i]);
				this._handleRemovalsInternal(
					recursiveBasePath,
					in_registeredSubPaths[keys[i]],
					in_referencePropertySubTable && in_referencePropertySubTable[keys[i]],
					0, // no indirections for any recursive calls
					in_simulated,
					in_calledForReferenceTargetChanged,
					false, // remove at root is now false, children are not the root
					true, // call remove for the root on the subtrees, since they are not the root... root
					recursiveCallRemovals, // call any remove/reference remove callbacks on the children
					false, // in_isRoot is false for children
				);
				recursiveBasePath.pop();
			}
		}

		// If we called the removals, and we had a path, we clear the target prop path
		if (in_callRemovals && registeredData && registeredData.lastTargetPropAbsPath) {
			registeredData.lastTargetPropAbsPath = undefined;
		}
	}
	/* eslint-enable complexity */

	/**
	 * Invoke the insert callbacks for all the paths in the provided registered paths, perhaps filtered
	 * by in_interestingPaths and in_handle.
	 *
	 * @param in_baseTokenizedPath - where the invocation is relative to, compared to 'this' databinding
	 * @param in_registeredPaths - the registered paths to check
	 * @param in_baseProperty - the property from which the registeredPaths are relative to
	 * @param in_simulated - if true, we are adding in a retroactive case, where the property
	 * already existed and we are simulating
	 * @param in_bindToRef - if true, register callbacks on any reference properties found
	 * @param in_interestingPaths - an optional hierarchy of the paths to examine in
	 * in_registeredPaths. Only paths in this hierarchy and in in_registeredPaths will be considered. By hierarchy,
	 * we mean {a: {b: {}, c: { d:{}}}} will only visit a.b and a.c.d
	 * @param in_handle - restrict the invocation to only registrations relating to in_handle
	 *
	 * @hidden
	 */
	_invokeInsertCallbacksForPaths(
		in_baseTokenizedPath: (string | number)[],
		in_registeredPaths: any,
		in_baseProperty: BaseProperty,
		in_simulated: boolean,
		in_bindToRef: boolean,
		in_interestingPaths?: any,
		in_handle?: DataBinderHandle,
	) {
		const registrationId = in_handle ? in_handle.getUserData().registrationId : undefined;
		const traversalStack: any[] = [];
		traversalStack.push({
			interestingPaths: in_interestingPaths,
			registeredPaths: in_registeredPaths,
			parentProperty: in_baseProperty,
			traversalPath: [],
			traversalToken: undefined,
		});

		while (traversalStack.length) {
			const topOfStack = traversalStack.pop();
			const interestingPaths = topOfStack.interestingPaths;
			const registeredPaths = topOfStack.registeredPaths;
			const traversalPath = topOfStack.traversalPath;
			const traversalToken = topOfStack.traversalToken;
			const parentProperty = topOfStack.parentProperty;

			// Get the child at traversalToken. If it is a reference property, also get the target.
			// The following two-step .get() is designed to avoid doing multiple gets for the common
			// case where the child is not a reference property.

			// Get the property for the child
			let currentProperty: BaseProperty | undefined = undefined;
			if (traversalToken !== undefined) {
				try {
					// Use RESOLVE_NO_LEAFS to avoid dereferencing if it the child is a reference
					currentProperty = parentProperty.get(traversalToken, RESOLVE_NO_LEAFS);
				} catch (error) {
					// 'OK'; leave undefined
				}
			} else {
				// Special case of the root of the traversal
				currentProperty = parentProperty;
			}

			// If it's a reference, set currentProperty to the target, and currentReferenceProperty to the reference.
			let currentReferenceProperty: BaseProperty | undefined = undefined;
			const isProperty = currentProperty instanceof BaseProperty;
			if (isProperty && TypeIdHelper.isReferenceTypeId(currentProperty!.getFullTypeid())) {
				// It is a reference -- follow the reference to the eventual target.
				currentReferenceProperty = currentProperty! as ReferenceProperty;
				currentProperty = undefined;
				try {
					currentProperty = (currentReferenceProperty as any).get();
				} catch (error) {
					// 'OK'; leave undefined
				}
			}

			if (registeredPaths && registeredPaths.__registeredDataBindingHandlers) {
				// Invoke insert handlers
				if (
					currentProperty &&
					!currentReferenceProperty &&
					registeredPaths.__registeredDataBindingHandlers.insert
				) {
					const modificationContext = new ModificationContext(
						undefined,
						"insert",
						currentProperty.getAbsolutePath(),
						currentProperty.getContext(),
						this,
						(in_baseTokenizedPath as any).concat(traversalPath),
						in_simulated,
					);
					// Since we have the property, cache it on the context to avoid recomputation
					modificationContext._hintModifiedProperty(currentProperty);
					_.each(registeredPaths.__registeredDataBindingHandlers.insert, (in_handler: any) => {
						// the insert handlers probably should always be called (TODO: even w.r.t. bindToReference?)
						// console.log('calling insert for: ' + traversalPath + ' currentProperty: ' + currentProperty);
						// note that the nested ChangeSet supplied is undefined!
						if (registrationId === undefined || in_handler.registrationId === registrationId) {
							in_handler.pathCallback.call(this, modificationContext);
						}
					});
				}
				if (
					currentReferenceProperty &&
					registeredPaths.__registeredDataBindingHandlers.referenceInsert
				) {
					const modificationContext = new ModificationContext(
						undefined,
						"insert",
						currentReferenceProperty.getAbsolutePath(),
						currentReferenceProperty.getContext(),
						this,
						(in_baseTokenizedPath as any).concat(traversalPath),
						in_simulated,
						true, // bound to the reference
					);
					// Since we have the property, cache it on the context to avoid recomputation
					modificationContext._hintModifiedProperty(currentReferenceProperty);
					_.each(
						registeredPaths.__registeredDataBindingHandlers.referenceInsert,
						(in_handler) => {
							if (
								registrationId === undefined ||
								in_handler.registrationId === registrationId
							) {
								in_handler.pathCallback.call(this, modificationContext);
							}
						},
					);
				}
				if (
					currentProperty !== undefined &&
					registeredPaths.__registeredDataBindingHandlers.collectionInsert
				) {
					_.each(
						registeredPaths.__registeredDataBindingHandlers.collectionInsert,
						(in_handler) => {
							const rightId =
								registrationId === undefined || in_handler.registrationId === registrationId;
							const isContainer = isCollection(currentProperty);
							if (rightId && isContainer) {
								const keys = (currentProperty as any).getIds();
								const keyedPath = in_baseTokenizedPath.concat(traversalPath) as any;
								for (let k = 0; k < keys.length; k++) {
									let currentKey = keys[k];
									if (currentProperty!.getContext() === "array") {
										currentKey = parseInt(currentKey, 10);
									}
									let quotedKey = currentKey;
									if (currentProperty!.getContext() !== "array") {
										quotedKey = PathHelper.quotePathSegmentIfNeeded(currentKey);
									}
									keyedPath.push(quotedKey);
									// Note, currentProperty here is not the root, so we can simply concatenate [quotedKey]
									const modificationContext = new ModificationContext(
										undefined,
										"insert",
										currentProperty!.getAbsolutePath() + "[" + quotedKey + "]",
										currentProperty!.getContext(), // shouldn't this be the context of the collection item?
										this,
										keyedPath,
										in_simulated,
									);

									in_handler.pathCallback.call(this, currentKey, modificationContext);
									keyedPath.pop();
								}
							}
						},
					);
				}
			}

			// We only recurse, if we found a property.
			// Determine paths on which to recurse
			// We only recurse on the interesting keys that are also registered paths
			if (currentProperty && !currentReferenceProperty) {
				let keys = _.keys(registeredPaths);
				if (interestingPaths) {
					const interestingKeys = _.keys(interestingPaths);
					keys = _.intersection(interestingKeys, keys);
				}
				for (let i = 0; i < keys.length; i++) {
					if (
						keys[i] !== "__registeredDataBindingHandlers" &&
						keys[i] !== "__registeredData"
					) {
						const token = unescapeTokenizedStringForMap(keys[i]);
						traversalStack.push({
							interestingPaths: interestingPaths ? interestingPaths[keys[i]] : undefined,
							registeredPaths: registeredPaths[keys[i]],
							traversalToken: token,
							traversalPath: traversalPath.concat(token),
							parentProperty: currentProperty,
						});
					}
				}
			}

			if (currentReferenceProperty && in_bindToRef) {
				if (!currentProperty || currentProperty.getContext() === "single") {
					// console.log('added reference from:' + referencePath + ' to: ' + path);
					this._registerCallbacksForSingleReferenceProperty(
						traversalPath,
						[],
						registeredPaths,
						this._referencePropertyTable as any,
						0, // level is 0
						currentReferenceProperty as ReferenceProperty,
						undefined,
						true, // registering retroactively
						undefined,
					);
				} else {
					console.error("Only single references are currently supported for references");
				}
			}
		}
	}

	/**
	 * Augments the prototype of the given data binding class to call the given function for events at the given path(s)
	 *
	 * @param in_dataBindingConstructor - constructor object for the data binding class
	 * @param in_path - the property path(s) for which the function should be called
	 * @param in_operations -
	 *     the operations for which the callback function gets called
	 *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove',
	 *     'referenceInsert', 'referenceModify', 'referenceRemove')
	 * @param in_function - the function to invoke
	 * @param in_options - Additional user specified options for the callback and its registration   *
	 * @returns A handle to unregister this _registerOnPath with
	 * @package
	 * @hidden
	 */
	_registerOnPath(
		in_dataBindingConstructor: typeof DataBinding,
		in_path: (string | number)[] | string,
		in_operations: string[],
		in_function: Function,
		in_options: CallbackOptions = { isDeferred: false },
	): DataBinderHandle {
		// We support registering on path for absolute path callbacks, and our databinding is marked as internal
		if (!in_dataBindingConstructor.__absolutePathInternalBinding) {
			if (isDataBindingRegistered(in_dataBindingConstructor)) {
				throw new Error(
					"Registering on path after the DataBinding has been registered with a DataBinder.",
				);
			}
		}

		const referenceChangedIdx = in_operations.indexOf("referenceChanged");
		const filteredOperations = in_operations.slice();
		if (referenceChangedIdx !== -1) {
			// I think this is the first time I've used the full splice function for it's actual initial design.
			filteredOperations.splice(referenceChangedIdx, 1, "insert", "remove");
			console.warn(
				"referenceChanged is deprecated. Short term, the binding is being replaced with the " +
					"pair insert and remove, but this may not exactly mimic all the functionality of the " +
					"deprecated feature",
			);
		}
		if (in_options && (in_options as any).replaceExisting !== undefined) {
			// @TODO remove this
			console.warn(
				"replaceExisting is deprecated. The behavior is now as if replaceExisting is false",
			);
		}

		if (!in_function) {
			// Common to mistake this.myFunc vs. this.prototype.myFunc.
			throw new Error(
				"No callback provided to DataBinding registration function(are you missing this.prototype?)",
			);
		}

		// Install a callback that will allow the querying of _registerPaths etc. on all the prototypes.
		installForEachPrototypeMember(in_dataBindingConstructor);

		// copy the options that are relevant to how the callback is called into an options object that is stored
		// along with the callback (but only if we have to). Currently this is just 'bindToReference'
		const callback = in_options.isDeferred
			? deferCallback.call(this, in_function as any)
			: in_function;

		const paths = _.isArray(in_path) ? in_path : [in_path];

		let tokenizedPaths = _.map(paths, (p) => PathHelper.tokenizePathString(p as string));
		let escapedPaths = _.map(tokenizedPaths, (p) => escapeTokenizedPathForMap(p));

		// Create a handle to represent this registration.
		const handle = createHandle(
			in_dataBindingConstructor,
			escapedPaths as any[],
			filteredOperations,
			callback,
		);

		// Keep a central list of all the handles, so unregisterAllOnPathListeners can unregister them
		// all.
		const allPathHandles = getOrCreateMemberOnPrototype(
			in_dataBindingConstructor,
			"_allPathHandles",
			[],
		) as any;
		allPathHandles.push(handle);

		return handle;
	}

	/**
	 * Augments the prototype of the given DataBinding class to call the given function for events at the given path.
	 * The callback will get the property at that path as parameter (or undefined if the property no longer exists, e.g.
	 * after a delete or reference change).
	 *
	 * @param in_dataBindingConstructor - constructor object for the data binding class
	 * @param in_path - the property path for which the function should be called on modify() events
	 * @param in_operations - the operations for which the callback function gets called
	 *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove')
	 * @param in_function - The function to add
	 * @param in_options - Additional user specified options for the callback and its registration
	 * @param in_options.requireProperty -
	 *     If true the callback will only be called if the corresponding Property exists, i.e. it won't be called for
	 *     'remove' events. The default is false.
	 * @package
	 * @hidden
	 */
	_registerOnProperty(
		in_dataBindingConstructor: typeof DataBinding,
		in_path: string,
		in_operations: Array<string>,
		in_function: Function,
		in_options: IRegisterOnPropertyOptions,
	) {
		let requireProperty = in_options && in_options.requireProperty;
		DataBinding.prototype._registerOnPath(
			in_dataBindingConstructor,
			in_path,
			in_operations,
			function (this: DataBinding) {
				if (arguments.length > 1) {
					invokeWithCollectionProperty.call(
						this,
						in_function,
						requireProperty!,
						arguments[0],
						arguments[1],
					);
				} else {
					invokeWithProperty.call(this, in_function, requireProperty!, arguments[0]);
				}
			},
			in_options,
		);
	}

	/**
	 * Helper function to return the runtime object associated to the property this DataBinding is associated with.
	 * By default, it will return the runtime representation for the same binding type of the DataBinding, i.e.,
	 * {@link DataBinding.getDataBindingType}.
	 *
	 * Runtime representations are defined with {@link DataBinder.defineRepresentation}
	 *
	 * @param in_bindingType - binding type to fetch; if not specified it will use the same
	 *   binding type as the DataBinding.
	 *
	 * @returns The runtime representation associated with the property this binding
	 *   is associated with, or undefined if there is no runtime representation registered for this
	 *   binding type. If the property associated with this binding is already removed, it throws.
	 *
	 * @throws If the property associated with this DataBinding does not exist anymore (e.g. in onRemove() callbacks)
	 */
	getRepresentation<T>(in_bindingType: string | undefined = undefined): T | undefined {
		return this.getDataBinder().getRepresentation(
			this.getProperty()!,
			in_bindingType || this.getDataBindingType(),
		);
	}

	/**
	 * Register a callback to a relative property path. It will be triggered on the given events. The callback will
	 * receive the property (at the relative path) as a parameter.
	 *
	 * @example
	 * @snippet javascript 'test/data_binder/data_binding.spec.js'
	 *      SnippetStart{DataBinding.registerOnProperty} SnippetEnd{DataBinding.registerOnProperty}
	 *
	 * @param in_path Relative property path.
	 * @param in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
	 * @param in_callback The function to call, when the property behind the relative path changes. It receives
	 * the property found via path, and a key / index if it gets triggered for one of the collection events.
	 * @param in_options  Additional user specified options on how the callback should be
	 * registered.
	 */
	static registerOnProperty(
		in_path: string,
		in_events: Array<string>,
		in_callback: Function,
		in_options: IRegisterOnPropertyOptions = {},
	) {
		if (_.isArray(in_path)) {
			throw new Error("Multiple paths not supported for registerOnProperty");
		}
		DataBinding.prototype._registerOnProperty(
			this,
			in_path,
			in_events,
			in_callback,
			in_options,
		);
	}

	/**
	 * Register a callback to a property path relative to the property associated with the databinding. It will
	 * be triggered on the given events.
	 * If multiple paths are provided for 'in_path', the callback will only be called once per changeset
	 *
	 * See {@link DataBinding.registerOnProperty} for an example; the only difference is the callback will
	 * receive a {@link ModificationContext}.
	 *
	 * @param in_path Path(s) relative to the property to bind on changes.
	 * @param in_events Array of the event names to bind to:<br>
	 * - modify: Triggered when the property found via the provided path is modified. When the path contains a
	 *   ReferenceProperty this event tells us if the referenced property has been modified.<br>
	 * - insert: Triggered when the property found via the provided path is inserted. when the path contains a
	 *   ReferenceProperty this event tells us if the referenced property has been inserted.<br>
	 * - remove: Triggered when the property found via the provided path is removed. when the path contains a
	 *   ReferenceProperty this event tells us if the referenced property has been removed.<br>
	 * - collectionModify: Triggered when the property found via path is a collection, and an entry is modified.
	 * - collectionInsert: Triggered when the property found via path is a collection, and an entry is inserted.
	 * - collectionRemove: Triggered when the property found via path is a collection, and an entry is removed.
	 * - referenceModify: Triggered when the ReferenceProperty found via path is modified.
	 * - referenceInsert: Triggered when the ReferenceProperty found via path is inserted.
	 * - referenceRemove: Triggered when the ReferenceProperty found via path is removed.
	 * @param in_callback The function to call when the property behind the relative path changes.
	 * @param in_options Additional user specified options on how the callback should be
	 * registered.
	 */
	static registerOnPath(
		in_path: Array<string> | string,
		in_events: Array<string>,
		in_callback: Function,
		in_options: IRegisterOnPathOptions = {},
	) {
		DataBinding.prototype._registerOnPath(this, in_path, in_events, in_callback, in_options);
	}

	/**
	 * Same as registerOnProperty, but the callback will get a JSON representation of the value of the property.
	 *
	 * See {@link DataBinding.registerOnProperty} for an example; the only difference is the callback will
	 * receive a JSON representation of the value of the property.
	 *
	 * @param in_path Path relative to the property to bind on value changes.
	 * @param in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
	 * @param in_callback The function to call, when the property behind the relative path changes.
	 * @param in_options Additional user specified options on how the callback should be
	 * registered.
	 */
	static registerOnValues(
		in_path: string,
		in_events: Array<string>,
		in_callback: Function,
		in_options: IRegisterOnPathOptions = {},
	) {
		if (_.isArray(in_path)) {
			throw new Error("Multiple paths not supported for registerOnValues");
		}
		this._handleBinding(this._registerOnValues, in_path, in_events, in_callback, in_options);
	}

	/**
	 * Same as registerOnProperty, but the callback will get a JSON representation of the property.
	 * @param in_path Path relative to the property to bind on value changes.
	 * @param in_events Array of the event names to bind to: modify, insert, remove.
	 * @param in_callback The function to call, when the property behind the relative path changes.
	 * @param in_options Additional user specified options on how the callback should be registered.
	 *
	 * @hidden
	 */
	private static _registerOnValues(
		this: typeof DataBinding,
		in_path: string,
		in_events: Array<string>,
		in_callback: Function,
		in_options: any = {},
	) {
		this.registerOnProperty(
			in_path,
			in_events,
			function (this: DataBinding, propertyOrKey: any, parent: any) {
				// propertyOrIndex could be a primitive value when registering callbacks on primitive collection,
				// then it value represent the index/key of the entry involved in the registered event.
				if (propertyOrKey instanceof BaseProperty) {
					const property = propertyOrKey as any;
					const values =
						property.isPrimitiveType() && property.getContext() === "single"
							? property.getValue()
							: property.getValues();
					in_callback.call(this, values);
				} else {
					const key = propertyOrKey;
					let values: any;
					// parent won't be available upon removal
					if (parent) {
						values = parent.get(key);
					}
					in_callback.call(this, key, values);
				}
			},
			in_options,
		);
	}

	/**
	 * Same as registerOnProperty, but the callback will get a JSON representation of the property.
	 * @param in_register A function to register relative path callbacks.
	 * @param in_path Path relative to the property to bind on value changes.
	 * @param in_events See {@link DataBinding.registerOnPath [events]} parameter
	 * @param in_callback See {@link DataBinding.registerOnPath [callback]} parameter
	 * @param in_options See {@link DataBinding.registerOnPath [options]} parameter
	 *
	 * @hidden
	 */
	private static _handleBinding(
		in_register: Function,
		in_path: string,
		in_events: Array<string>,
		in_callback: Function,
		in_options = {},
	) {
		in_options = in_options || {};
		const filteredOptions = _.pick(in_options, validOptions);
		in_register.call(this, in_path, in_events, in_callback, filteredOptions);
	}
	// TODO: Unregister function.
}

/**
 *  Decorator and decorator factories to register methods of DataBindings as callbacks
 */

/**
 * Function to use as a decorator when defining a DataBinding class. When prefixed before a function
 * on your databinding class, the class will be statically extended to automatically be called back when the
 * values are changed in the corresponding property.
 *
 * @example
 * @snippet javascript 'test/data_binder/es6_decorator_data_binding.spec.js'
 *      SnippetStart{onValueDecorator} SnippetEnd{onValueDecorator}
 *
 * @param in_path Path relative to the property to bind on value changes.
 * @param in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param in_options Additional user specified options on how the callback should be
 * registered.
 * @returns A function that registers the decorated callback using registerOnValues.
 * @internal
 */
export const onValuesChanged = function (
	_in_path: string,
	_in_events: Array<string>,
	_in_options: IRegisterOnPathOptions = {},
): Function {
	return createRegistrationFunction("registerOnValues", arguments);
};

/**
 * Function to use as a decorator when defining a DataBinding class. When prefixed before a function
 * on your databinding class, the class will be statically extended to automatically be called back when the
 * corresponding property is changed.
 *
 * See {@link onValuesChanged} for an example of using decorators. The callback will receive a property
 * instead of a value.
 *
 * @param in_path Path relative to the property to bind on property changes.
 * @param in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param in_options Additional user specified options on how the callback should be
 * registered.
 * @returns  function that registers the decorated callback using registerOnProperty.
 * @internal
 */
export const onPropertyChanged = function (
	_in_path: string,
	_in_events: Array<string>,
	_in_options: IRegisterOnPathOptions = {},
): Function {
	return createRegistrationFunction("registerOnProperty", arguments);
};

/**
 * Function to use as a decorator when defining a DataBinding class. When prefixed before a function
 * on your databinding class, the class will be statically extended to automatically be called back when the
 * corresponding property is changed.
 *
 * If multiple paths are provided for 'in_path', the callback will only be called once per change set
 *
 * See {@link onValuesChanged} for an example of using decorators. The callback will receive a
 * {@link ModificationContext} instead of a value.
 *
 * @param in_path Path(s) relative to the property to bind on changes.
 * @param in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param in_options Additional user specified options on how the callback should be
 * registered.
 * @returns A function that registers the decorated callback using registerOnPath.
 * @internal
 */
export const onPathChanged = function (
	_in_path: Array<string> | string,
	_in_events: Array<string>,
	_in_options: IRegisterOnPathOptions = {},
): Function {
	return createRegistrationFunction("registerOnPath", arguments);
};
