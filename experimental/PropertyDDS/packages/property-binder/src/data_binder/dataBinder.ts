/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeSet, ExtractedContext, PathHelper, SerializedChangeSet, TraversalContext, TypeIdHelper, Utils } from '@fluid-experimental/property-changeset';
import { SharedPropertyTree } from '@fluid-experimental/property-dds';
import { BaseProperty, PropertyFactory, TOKEN_TYPES_TYPE } from '@fluid-experimental/property-properties';
import _ from 'lodash';
import { IActivateDataBindingOptions, IDefineRepresentationOptions, IRegisterOnPathOptions, representationGenerator } from '..';
import { ActivationQueryCacheHelper, ActivationType } from '../internal/activationQueryCacheHelper';
import { RESOLVE_ALWAYS, RESOLVE_NEVER, RESOLVE_NO_LEAFS } from '../internal/constants';
import { DataBinderHandle } from '../internal/dataBinderHandle';
import { PropertyElement } from '../internal/propertyElement';
import { SemverMap, UpgradeType } from '../internal/semvermap';
import { StatelessDataBindingWrapper } from '../internal/statelessDataBindingWrapper';
import { CallbackOptions, DataBinding } from './dataBinding';
import { DataBindingRegistry } from './dataBindingRegistry';
import { ArrayNode, concatTokenizedPath, DataBindingTree, NodeType } from './dataBindingTree';
import { IDefineDataBindingOptions } from './IDefineDataBindingOptions';
import {
    assertOperation, deferCallback, forEachProperty, invokeCallbacks, isPrimitiveCollection, makeCallbackOncePerChangeSet, minimalRootPaths, RecursiveCallback, recursivelyVisitHierarchy, visitTypeHierarchy
} from './internalUtils';
import { ModificationContext } from './modificationContext';
import { RemovalContext } from './removalContext';




export interface DataBindingDefinition {
    bindingType: string;
    bindingConstructor: typeof DataBinding,
    typeID: string,
    splitType: ExtractedContext

}

/**
 * @hidden
 */
const _INTERNAL_DATA_BINDINGTYPE = '__DataBinderInternal';

/**
 * @hidden
 */
const _BUILDING_FLAG = 'BUILDING';

/**
 * Global counter to uniquely identify instances of the databinder.
 * @hidden
 */
let _dataBinderId = 0;

/**
 * Helper function to ensure that the provided path has a preceding slash and is clean.
 * Any a..b etc are all cleaned up.
 *
 * If the path is empty, this is assumed to mean 'no path', and no slash is added.
 *
 * @private
 * @hidden
 *
 * @param in_path - the string path to convert. Empty implies no path.
 * @returns the normalized, cleaned path
 *
 * @throws if there is an invalid path
 */
const _normalizePath = function(in_path: string | undefined): string {
    let result: string;
    if (in_path === undefined || in_path === '') {
        result = '';
    } else {
        if (in_path[0] !== '/') {
            result = '/' + in_path;
        } else {
            result = in_path;
        }
        // Clean the path (get rid of a..b etc.)
        const delimiters = [];
        const tokenized = PathHelper.tokenizePathString(result.substr(1), delimiters);
        result = '/' + concatTokenizedPath(tokenized, delimiters, tokenized.length);
    }
    return result;
};

/**
 * Compute the appropriate starting path for searching for places to instantiate the handle.
 *
 * @param in_exactPath - the exact path to match, or empty string to disable
 * @param in_includePrefix - the prefix requirement to instantiate the binding
 *
 * @returns the appropriate starting path
 *
 * @hidden
 */
const _getStartPath = function(in_exactPath: string, in_includePrefix: string): string {
    let startPath;
    if (in_exactPath !== '') {
        startPath = in_exactPath;
    } else if (in_includePrefix !== '') {
        startPath = in_includePrefix;
    } else {
        startPath = '/';
    }
    return startPath;
};

/**
 * Unfortunately TraversalContext does not support a push/pop of the user data.
 * We simulate it here.
 * @param in_context - The current traversal context
 * @param in_data - the data to push on the context (assumed to be an Object)
 *
 * @hidden
 */
const _pushUserData = function(in_context: Utils.TraversalContext, in_data: any) {
    in_data.__oldUserData = in_context.getUserData();
    in_context.setUserData(in_data);
};

/**
 * Unfortunately TraversalContext does not support a push/pop of the user data.
 * We simulate it here.
 * @param in_context - The current traversal context
 * @param in_data - the data to push on the context (assumed to be an Object)
 *
 * @hidden
 */
const _popUserData = function(in_context: Utils.TraversalContext) {
    const currentUserData = in_context.getUserData();
    console.assert(currentUserData);
    if (currentUserData) {
        in_context.setUserData(currentUserData.__oldUserData);
    }
};

/**
 * A DataBinder allows one to register a number of bindings for different property types. The
 * DataBinder can then be bound to
 * a PropertyTree to have the data bindings created automatically.
 *
 * These data bindings are notified of the modification and removal of the underlying property.
 *
 * @example
 * ```typescript
 * const databinder = new DataBinder(propertyTree);
 * databinder.defineDataBinding(...);
 *
 * // or
 * const databinder = new DataBinder();
 * databinder.defineDataBinding(...);
 * // ...
 * databinder.attachTo(propertyTree);
 * const workspace = databinder.getPropertyTree();
 * // ...
 * ```
 */
export class DataBinder {
    _dataBinderId: number;

    _registry: DataBindingRegistry;

    _onModifiedRegistrationKey: any | undefined;

    _propertyTree: SharedPropertyTree | undefined;

    _postProcessingCallbackQueue: Function[];

    _dataBindingTree: DataBindingTree;

    _removedDataBindings: Map<any, any>;

    _activationScope: number;

    _definitionsByBindingType: Map<string, DataBinderHandle[]>;

    _activationHandlesByBindingType: Map<string, DataBinderHandle[]>;

    _delayedActivationHandles: Set<DataBinderHandle>;

    _representationGenerators: Map<any, any>;

    _representationHandlesByBindingType: Map<any, any>;

    _buildingStatelessRepresentations: Map<any, any>;

    _activeTraversal: boolean;

    _visitationIndex: number;

    _currentChangeSetId: number;

    _dataBindingCreatedCounter: number;

    _dataBindingRemovedCounter: number;

    _AbsolutePathDataBinding: typeof DataBinding;

    dataBinder: any;

    /**
     * Constructor for the DataBinder.
     * @param - The PropertyTree to bind to.
     */
    constructor(propertyTree?: SharedPropertyTree) {

        this._dataBinderId = _dataBinderId++;

        this._registry = new DataBindingRegistry(); // Registry for the DataBinding construction
        this._onModifiedRegistrationKey = null; // key for registering the workspace 'modify' event
        this._postProcessingCallbackQueue = [];

        this._dataBindingTree = new DataBindingTree();
        this._removedDataBindings = new Map(); // map of DataBindings that are removed during a ChangeSet traversal

        this._activationScope = 0; // Track the bracketing level of pushRegistrationScope/popRegistrationScope

        this._definitionsByBindingType = new Map(); // Map from a given binding type to an array of definitions
        this._activationHandlesByBindingType = new Map(); // Map from a given binding type to activation handles
        this._delayedActivationHandles = new Set(); // activation handles not yet applied

        this._representationGenerators = new Map(); // Generators for runtime representations
        this._representationHandlesByBindingType = new Map();
        this._buildingStatelessRepresentations = new Map();  // Currently building stateless representations

        this._activeTraversal = false; // true when we're in a traversal

        this._visitationIndex = 0; // Used to avoid callbacks being called back multiple times

        this._currentChangeSetId = 0; // Used to ensure things happen only once per changeset. Always increasing.

        this._dataBindingCreatedCounter = 0; // Debug counter for tests
        this._dataBindingRemovedCounter = 0; // Debug counter for tests


        /**
         * A binding built to hold all absolute path callbacks. One per databinder
         *
         * Note: For class internal use only
         */
        class AbsolutePathDataBinding extends DataBinding {
            static __absolutePathInternalBinding: boolean;
        }

        // We register a DataBinding at the root of the entire hierarchy to hold all absolute path callbacks

        this._AbsolutePathDataBinding = AbsolutePathDataBinding;

        this.register(_INTERNAL_DATA_BINDINGTYPE, 'NodeProperty', AbsolutePathDataBinding, {
            exactPath: '/'
        });

        AbsolutePathDataBinding.__absolutePathInternalBinding = true;

        // Make sure the initialization method is called after all other code in the constructor, as it might synchronously
        // attach a workspace, which relies on internal data structures being set up properly.
        if (propertyTree) {
            this.attachTo(propertyTree);
        }
    }

    /**
     * Registers a stateless data binding. The provided binding will be called for all events on any property that
     * matches the path rules in the options.
     *
     * @param in_bindingType             - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
     * @param in_typeID                  - The id to use for this registration, usually the type id of the
     *                                              objects being represented (like a PropertySet template id).
     * @param in_statelessConstructor  - The stateless binding's constructor. Must take a parameter
     *                                              object as its only argument.
     * @param in_options - An object containing optional parameters.
     *
     * @returns A handle that can be used to unregister this data binding
     * @public
     */
    registerStateless(in_bindingType: string, in_typeID: string,
        in_statelessConstructor: DataBinding, in_options: IActivateDataBindingOptions = {}): DataBinderHandle {
        const statelessOptions = _.clone(in_options);
        statelessOptions.userData = _.clone(in_options.userData || {});
        statelessOptions.userData.singleton = in_statelessConstructor;

        return this.register(in_bindingType, in_typeID, StatelessDataBindingWrapper, statelessOptions);
    }

    /**
     * Return whether a databinding exists for the given typeID/binding type pair
     *
     * Data Bindings are associated with a binding type and a typeID.
     *
     * @param in_bindingType             - The type of the data binding.  (ex. 'BINDING', 'DRAW', 'UI', etc.)
     * @param in_typeID                  - The id to use for this registration, usually the type id of the
     *                                              objects being represented (like a PropertySet template id).
     * @returns True if and only if there is a binding for this combination
     *
     * @public
     */
    hasDataBinding(in_bindingType: string, in_typeID: string): boolean {
        return this._registry.has(in_bindingType, in_typeID);
    }

    /**
   * Defines and activates a new data binding.
   * This function will retroactively create bindings for any properties already present in the workspace that
   * match the path options provided.
   *
   * @deprecated Please use {@link DataBinder.defineDataBinding} and {@link DataBinder.activateDataBinding} instead.
   *
   * @param in_bindingType - The type of the data binding.  (ex. 'BINDING', 'DRAW', 'UI', etc.)
   * @param in_typeID - The id to use for this registration, usually the type id of the
   *                                              objects being represented (like a PropertySet template id).
   * @param in_bindingConstructor - The constructor for the data binding. Must take a parameter object
   *                                              as its only argument.
   * @param in_options - An object containing additional parameters.
   *
   * @returns A handle that can be used to unregister this data binding.
   * @public
   * @throws Will throw an error if the constructor is missing or invalid.
   */
  register(in_bindingType: string, in_typeID: string, in_bindingConstructor: typeof DataBinding, in_options: any = {}): DataBinderHandle {
    if (in_options.onDemandEntity) {
      console.warn('DataBinder.register with \'onDemandEntity\' is deprecated. All entities are now on-demand.');
    }

    const definitionHandle = this.defineDataBinding(in_bindingType, in_typeID, in_bindingConstructor);
    const activationHandle = this.activateDataBinding(in_bindingType, in_typeID, in_options);

    const handle = new DataBinderHandle(function() {
      activationHandle.destroy();
      definitionHandle.destroy();
    });

    // Be nice to current clients
    (handle as any).unregister = function() {
      console.warn('unregister() on a handle is deprecated. Please use destroy()');
      this.destroy();
    };

    return handle;
  }

    /**
     * Defines a new DataBinding in the DataBinder. No instances are created until activateDataBinding is called for the
     * bindingType/typeID pair.
     *
     * Data Bindings are associated with a binding type and a typeID. These definitions can then be activated using
     * {@link DataBinder.activateDataBinding}. For a given property, the DataBinder will consider all active DataBindings,
     * choose the definition that best matches the property type (based on inheritance), and create the binding using
     * the constructor.
     *
     * @param in_bindingType - The type of the data binding.  (ex. 'BINDING', 'DRAW', 'UI', etc.)
     * @param in_typeID - The id to use for this registration, usually the type id of the objects
     *                    being represented (like a PropertySet template id).
     * @param in_bindingConstructor  - The constructor for the data binding. Must take a parameter object
     *                                              as its only argument.
     * @param in_options - optional options for the new databinding
     * @returns A handle that can be used to undefine the binding.
     *
     * @public
     * @throws If the constructor is missing or invalid.
     * @throws If the bindingType/typeID pairing is already defined.
     */
    defineDataBinding(in_bindingType: string, in_typeID: string, in_bindingConstructor: typeof DataBinding, in_options?: IDefineDataBindingOptions): DataBinderHandle {

        // Ensure we don't define the same bindingtype/typeID pair twice
        if (this._registry.has(in_bindingType, in_typeID)) {
            throw new Error('DataBinding already defined for this typeID and binding type pair');
        }
        if (!in_bindingConstructor || !in_bindingConstructor.prototype) {
            throw new Error('Missing or invalid constructor for data binding definition');
        }

        const newDefinition: DataBindingDefinition = {
            bindingConstructor: in_bindingConstructor,
            bindingType: in_bindingType,
            typeID: in_typeID,
            splitType: TypeIdHelper.extractContext(in_typeID)
        };

        this._registry.register(
            in_bindingType,
            in_typeID,
            (in_options && in_options.upgradeType) ? in_options.upgradeType : UpgradeType.NONE,
            newDefinition
        );

        // Mark the binding to prevent further modifications to the databinding
        this._markDataBindingAsRegistered(in_bindingConstructor);

        // Build and return a handle to destroy the definition with
        const definitionHandle = new DataBinderHandle(this._unregisterBindingDefinition.bind(this), newDefinition);

        const byBindingType = this._definitionsByBindingType.get(in_bindingType) || [];
        byBindingType.push(definitionHandle);
        this._definitionsByBindingType.set(in_bindingType, byBindingType);

        return definitionHandle;
    }

    /**
     * Handle callback to unregister a data binding definition. Note; this will not destroy any
     * bindings that are currently instantiated.
     *
     * @param in_handle - the handle that was just destroyed
     * @param in_definition - the definition of the databinding to unregister
     *
     * @hidden
     */
    private _unregisterBindingDefinition(in_handle: DataBinderHandle, in_definition: DataBindingDefinition) {
        const byBindingType = this._definitionsByBindingType.get(in_definition.bindingType);
        console.assert(byBindingType);
        if (byBindingType) {
            const index = byBindingType.indexOf(in_handle);
            if (index !== -1) {
                byBindingType.splice(index, 1);
            }
            if (byBindingType.length === 0) {
                this._definitionsByBindingType.delete(in_definition.bindingType);
            }
        }

        // Unregister from our internal registry
        this._registry.unregister(in_definition.bindingType, in_definition.typeID);

        // Remove the marking on the constructor; it is now legit to modify this constructor
        this._unmarkDataBindingAsRegistered(in_definition.bindingConstructor);
    }

    /**
     * Creates the bindings associated with the bindingType/typeID pair, following the rules for the path defined by
     * the options.
     *
     * For every property that matches the path options that is of type in_typeID, or inherits from type in_typeID,
     * the DataBinder will look for a DataBinding definition (defined using {@link DataBinder.defineDataBinding}) for
     * the in_bindingType that best matches the property type. This may be a definition associated with the type or
     * inherits from this type.
     *
     * Only a single DataBinding will be created for a given bindingType/typeID.
     *
     * When new properties are later inserted into the workspace that match the path rules in the options,
     * DataBindings will be created as well.
     *
     * @example
     * @snippet javascript 'test/data_binder/data_binding.spec.js'
     *      SnippetStart{DataBinder.DataBindingInheritance} SnippetEnd{DataBinder.DataBindingInheritance}
     *
     * @param in_bindingType             - The type of the data binding. (ex. 'BINDING', 'DRAW', 'UI', etc.)
     * @param in_typeID                  - The Property template id of the objects being represented.
     *                                              Properties with this type or inheriting from this type will be
     *                                              activated for this binding type.
     *                                              If not given, all bindings for in_bindingType will be activated.
     * @param in_options    - Activation options
     *
     * @returns A handle that can be used to deactivate this instance of the binding. See
     * {@link DataBinderHandle.destroy}.
     * @public
     */
    activateDataBinding(in_bindingType: string, in_typeID: string = '', in_options: IActivateDataBindingOptions = {}): DataBinderHandle {
        // Compute the paths from the options - this is where the caller wants the bindings to be created
        const exactPath = _normalizePath(in_options.exactPath);
        let includePrefix = _normalizePath(in_options.includePrefix);
        let excludePrefix = _normalizePath(in_options.excludePrefix);
        if (exactPath !== '') {
            // exactPath disables include/exclude prefix
            includePrefix = excludePrefix = '';
        }

        // Create an activation rule for this activation. Note this will activate anything that is of
        // type in_typeID or inherits from in_typeID
        // The activationInfo is a structure that will be shared by all instances of the databinding
        // when they are created.
        const activationInfo = {
            bindingType: in_bindingType,
            dataBinder: this,
            userData: in_options.userData
        };

        const activationRule: ActivationType = {
            activationSplitType: in_typeID ? TypeIdHelper.extractContext(in_typeID) : undefined,
            bindingType: in_bindingType,
            startPath: _getStartPath(exactPath, includePrefix),
            includePrefix: includePrefix,
            excludePrefix: excludePrefix,
            exactPath: exactPath,
            activationInfo
        };

        const newHandle = new DataBinderHandle(this._deactivateBinding.bind(this), activationRule);

        this.pushBindingActivationScope();

        this._delayedActivationHandles.add(newHandle);

        this.popBindingActivationScope();

        return newHandle;
    }

    /**
     * Deactivates a data binding.
     *
     * @param in_handle - The handle returned by the activateDataBinding function
     * @param in_activationRule - the binding rule associated with the handle - how it was activated
     *
     * @private
     * @hidden
     */
    _deactivateBinding(in_handle: DataBinderHandle, in_activationRule: ActivationType) {
        // Check first in the delayed list (never really activated)
        if (!this._delayedActivationHandles.delete(in_handle)) {
            this.pushBindingActivationScope();

            // Not there - should be activated, or else it was already deactivated
            const handles = this._activationHandlesByBindingType.get(in_activationRule.bindingType);
            console.assert(handles);
            if (handles) {
                const index = handles.indexOf(in_handle);
                console.assert(index >= 0);
                if (index >= 0) {
                    handles.splice(index, 1);
                }
            }

            // If we have a workspace, we forcibly unbind any existing data bindings.
            if (this.isAttached()) {
                this._unbindActiveBindings(in_activationRule);
            }

            this.popBindingActivationScope();
        }
    }

    /**
     * Delay the activation of bindings until {@link DataBinder.popBindingActivationScope}. Multiple
     * pushBindingActivationScope's can be nested.
     *
     * This feature can be used to delay activation when activating multiple data binding definitions
     * simultaneously.
     *
     * This functionality should be used with care, since unbalanced push/pop bracketing can render
     * the DataBinder permanently disabled. Consider doing push/pop scopes using try/catch blocks,
     * for example.
     *
     * @public
     */
    pushBindingActivationScope() {
        this._activationScope++;
    }

    /**
     * Pop the activation scope. When the push and pops balance themselves, any pending
     * binding activations will be done, and all the corresponding bindings will be created.
     *
     * See {@link DataBinder.pushBindingActivationScope}.
     *
     * @public
     */
    popBindingActivationScope() {
        if (this._activationScope === 0) {
            throw new Error('calling popRegistrationScope too many times');
        }

        --this._activationScope;
        this._checkDelayedBindings();
    }

    /**
     * Check if the system is in a state where the delayed bindings can be installed.
     * Bindings are delayed until the registration scope is zero, and there is a workspace
     * attached.
     * @hidden
     */
    private _checkDelayedBindings() {
        const dataBinder = this;

        if (this._activationScope === 0 && this.isAttached() && this._delayedActivationHandles.size) {
            // Activate all the bindings that have been queued up
            // Push a scope so anything created during this activation is delayed until the pop
            this.pushBindingActivationScope();

            // We empty _delayedActivationHandles immediately, in case new data bindings are recursively activated
            const handles = this._delayedActivationHandles;
            this._delayedActivationHandles = new Set();

            const delayedActivationRules: any[] = [];

            handles.forEach(function(in_handle) {
                const rule = in_handle.getUserData();
                delayedActivationRules.push(rule);

                const byType = dataBinder._activationHandlesByBindingType.get(rule.bindingType) || [];
                byType.push(in_handle);
                dataBinder._activationHandlesByBindingType.set(rule.bindingType, byType);
            });

            // Try/catch to ensure our push/pops are balanced.
            try {
                // We retroactively create bindings for anything that resolves to these rules
                this._createBindingsRetroactively(delayedActivationRules);
            } catch (error) {
                this.popBindingActivationScope();
                throw error;
            }

            this.popBindingActivationScope();
        }

        if (this._activationScope === 0) {
            this._postChangesetProcessing();
        }
    }

    /**
     * Set/increment a letiable on the data binding that says that it is registered with one or more
     * DataBinders. This allows DataBinding.registerOnPath to alert the user when they are registering a
     * path or property to a DataBinding after it is already registered in the manager.
     *
     * @param in_bindingConstructor - the constructor to modify
     * @hidden
     */
    private _markDataBindingAsRegistered(in_bindingConstructor: typeof DataBinding) {
        if (in_bindingConstructor.prototype.hasOwnProperty('__numDataBinders')) {
            in_bindingConstructor.prototype.__numDataBinders!++;
        } else {
            in_bindingConstructor.prototype.__numDataBinders = 1;
        }
    }

    /**
     * Clear/decrement a letiable on the data binding that says that it is registered with one or more
     * DataBinders. This allows DataBinding.registerOnPath to alert the user when they are registering a
     * path or property to a DataBinding after it is already registered in the manager.
     *
     * @param in_dataBindingConstructor - the constructor to modify
     *
     * @hidden
     */
    private _unmarkDataBindingAsRegistered(in_dataBindingConstructor: typeof DataBinding) {
        const hasCount = in_dataBindingConstructor.prototype.hasOwnProperty('__numDataBinders');
        console.assert(hasCount && in_dataBindingConstructor.prototype.__numDataBinders! > 0);
        if (hasCount) {
            in_dataBindingConstructor.prototype.__numDataBinders!--;
            console.assert(in_dataBindingConstructor.prototype.__numDataBinders! >= 0);
            if (in_dataBindingConstructor.prototype.__numDataBinders === 0) {
                // Might as well clean up
                delete in_dataBindingConstructor.prototype.__numDataBinders;
            }
        }
    }

    /**
     * Create a traversal context as if we were traversing the hierarchy at this location
     *
     * @param in_property - the property at the given path
     * @param in_traversalPath - the absolute path as a string
     * @param in_absTokenizedPath - the absolute path, tokenized
     * @param in_dataBindingTreeNode - the DataBindingTree node at the given path
     *
     * @returns a fake traversal context
     *
     * @hidden
     */
    private _createFakeTraversalContext(in_property: BaseProperty, in_traversalPath: string, in_absTokenizedPath: Array<string>,
        in_dataBindingTreeNode: NodeType): Utils.TraversalContext {
        let fakeContext = new TraversalContext({
            fullPostPath: in_traversalPath,
            fullPath: in_traversalPath,
            propertyContainerType: in_property.getContext() as any, // @TODO fix BaseProperty.getContext() return type to be more specific
            operationType: "insert"
        });

        if (!in_dataBindingTreeNode) {
            in_dataBindingTreeNode = this._dataBindingTree.insertChild(in_absTokenizedPath, in_property.getContext());
        }

        fakeContext.setUserData({
            property: in_property,
            dataBindingTreeNode: in_dataBindingTreeNode,
            retroactive: true // retroactively creating bindings
        });

        return fakeContext;
    }

    /**
     * Determine if the provided rule applies to the given property
     *
     * @param in_activationSplitType - the split type for what we are activating
     * @param in_propertySplitType - the split type for the property we are
     *        considering
     * @param in_definitionSplitType - the split type for the definition we would
     *        apply
     *
     * @returns true if the rule applies to this property type
     *
     * @hidden
     */
    private _activationAppliesToTypeId(in_activationSplitType: { context: string; typeid: string; }, in_propertySplitType: { context: string; typeid: string; }, in_definitionSplitType: { context: string; typeid: string; }): boolean {
        if (in_activationSplitType === undefined) {
            // No type was specified at activation time; the activation applies to everything
            return true;
        }
        if (in_propertySplitType.context !== in_activationSplitType.context) {
            return false;
        }
        // Note; even 'Float' is considered a BaseProperty ...
        const activationTypeId = in_activationSplitType.typeid;
        if (activationTypeId === 'BaseProperty') {
            return true;
        }
        if (PropertyFactory.inheritsFrom(
            in_propertySplitType.typeid,
            in_activationSplitType.typeid
        )) {
            return true;
        }
        if (PropertyFactory.inheritsFrom(
            in_definitionSplitType.typeid,
            in_activationSplitType.typeid
        )) {
            return true;
        }

        if (TypeIdHelper.isReferenceTypeId(in_propertySplitType.typeid) &&
            TypeIdHelper.isReferenceTypeId(in_activationSplitType.typeid) &&
            TypeIdHelper.isReferenceTypeId(in_definitionSplitType.typeid)) {
            const propTarget = TypeIdHelper.extractReferenceTargetTypeIdFromReference(in_propertySplitType.typeid);
            const activationTarget = TypeIdHelper.extractReferenceTargetTypeIdFromReference(in_activationSplitType.typeid);
            const definitionTarget = TypeIdHelper.extractReferenceTargetTypeIdFromReference(in_definitionSplitType.typeid);
            return this._activationAppliesToTypeId(
                TypeIdHelper.extractContext(activationTarget),
                TypeIdHelper.extractContext(propTarget),
                TypeIdHelper.extractContext(definitionTarget)
            );
        }
        return false;
    }

    /**
     * From the given root, builds all the databindings described by the activation rules.  The activation
     * rules have been filtered to be a simple case to visit.
     * Examples of complicated things:
     * - if there is an exactPath, we need to make sure that path is not going through a reference,
     * - a binding may start at a tree X, and another at a subtree X.Y; we need to adjust for that
     * - there may be an exclusion path
     *
     * If these are all removed, we are in a situation where we can just visit all the properties blindly
     *
     * @param in_rootPropertyElement - the property element from which to recurse from
     * @param in_activationRules - the activation rules to apply
     * @param io_instantiatedBindings - the accumulated bindings created
     *
     * @hidden
     */
    _fastCreateRetroactive(in_rootPropertyElement: PropertyElement, in_activationRules: ActivationType[], io_instantiatedBindings: any[]) {
        const activationHelper = new ActivationQueryCacheHelper(in_activationRules, this);

        const simpleVisitor = (property: BaseProperty) => {
            // Consider each possible binding, in order.
            const typeId = property.getFullTypeid();
            const bindings = activationHelper.typeRootBindings(typeId);
            if (bindings.length) {
                const propertyPath = property.getAbsolutePath().substr(1);
                const tokenizedPath = PathHelper.tokenizePathString(propertyPath);
                const treeNode = this._dataBindingTree.getNodeForTokenizedPath(tokenizedPath);


                // Check each rule, and see which ones apply
                bindings.forEach(({ rule, definition }) => {
                    // The activation rule says we should have a binding here
                    const existingBinding = treeNode ? treeNode.getDataBindingByType(rule.bindingType) : undefined;
                    if (!existingBinding) {
                        // We don't already have a binding for this property / bindingType pair.
                        const fakeContext = this._createFakeTraversalContext(
                            property,
                            propertyPath,
                            tokenizedPath,
                            treeNode!
                        );
                        fakeContext.getUserData().createdBindings = [];
                        if (this._createBindingFromDefinition(fakeContext, definition, rule.activationInfo)) {
                            // A binding was created -- call back for postCreate
                            io_instantiatedBindings.push(fakeContext);
                        }
                    } else {
                        // Already existing - increment the reference count.
                        if (!(existingBinding instanceof definition.bindingConstructor)) {
                            console.warn(
                                'Specializing a DataBinding after DataBindings have already been instantiated for bindingType: ',
                                rule.bindingType
                            );
                        } else {
                            existingBinding._incReferenceCount();
                        }
                    }
                });
            }

            // Only recurse if there is potentially a child that can have a relevant type.
            return activationHelper.childrenMayHaveBindings(typeId);
        };

        forEachProperty(in_rootPropertyElement.getProperty()!, simpleVisitor);
    }

    /**
     * From the given root, builds all the databindings described by the activation rules.
     *
     * @param in_rootPropertyElement - the property element from which to recurse from
     * @param in_activationRules - the activation rules to apply
     * @param io_instantiatedBindings - the accumulated bindings created
     *
     * @hidden
     */
    _generalCreateRetroactive(in_rootPropertyElement: PropertyElement, in_activationRules: ActivationType[], io_instantiatedBindings: DataBinding[]) {
        // General case traverser.
        const generalVisitor: RecursiveCallback = (in_propertyElement: PropertyElement, in_path: string, in_tokenizedPath: (string | number)[], in_treeNode: NodeType): boolean => {
            const typeId = in_propertyElement.getTypeId()!;
            const propertySplitType = TypeIdHelper.extractContext(typeId);

            // We currently only instantiate databindings on properties, never elements of primitive
            // containers.
            const isPureProperty = !in_propertyElement.isPrimitiveCollectionElement();
            const property = in_propertyElement.getProperty()!;
            let tokenizedAbsPath: string[];

            // Consider each possible binding, in order.
            // By default we will not recurse, unless one or more handles want to recurse.
            let recurse = false;

            // Check each rule, and see which ones apply
            _.each(in_activationRules, (rule) => {
                let instantiate: boolean;
                let thisRecurse: boolean;

                // We need to determine if we should instantiate this binding, and if we
                // should recurse. For clarity each case is explicitly enumerated
                if (rule.exactPath !== '') {
                    // Instantiate if we have the exact path
                    instantiate = isPureProperty && (rule.exactPath === in_path);
                    // Recurse if we haven't reached the exact path yet (but we're on the right track)
                    thisRecurse = (rule.exactPath.indexOf(in_path) === 0);
                    if (thisRecurse && rule.exactPath === in_path) {
                        // We're at the actual node. Only 'recurse' if it is a reference
                        // If we have an exact path a.b.c.d.ref, it's completely ambiguous in our system.
                        // Did you mean to bind to the reference 'ref', or did you mean to bind to the target
                        // referenced by 'ref'? We visit both if it is a reference.
                        thisRecurse = TypeIdHelper.isReferenceTypeId(typeId);
                    }
                } else {
                    // No specific path. Instantiate and recurse if the current path is in the subtree
                    thisRecurse = (in_path.indexOf(rule.startPath) === 0);
                    instantiate = thisRecurse && isPureProperty;
                    // But do not recurse through references or primitive containers
                    thisRecurse = thisRecurse && !TypeIdHelper.isReferenceTypeId(typeId);
                    thisRecurse = thisRecurse && !in_propertyElement.isPrimitiveCollection();
                }

                // If we want to instantiate, make sure the path is not excluded
                if (instantiate && rule.excludePrefix !== '' && in_path.indexOf(rule.excludePrefix) === 0) {
                    // The current path is in the subtree that is excluded -- don't instantiate, and don't bother recursing
                    instantiate = thisRecurse = false;
                }

                if (instantiate) {
                    // Get all the definitions for this typeid, and then filter them for ones that are activated.
                    const definitions = this._registry.getApplicableBindingDefinitions(
                        typeId, rule.bindingType, this._propertyTree
                    ).filter((definition: any) => {
                        return this._activationAppliesToTypeId(rule.activationSplitType!, propertySplitType, definition.splitType);
                    });

                    if (definitions.length > 0) {
                        // We have a databinding that applies to this property.
                        const existingBinding = this.resolve<DataBinding>(in_path, rule.bindingType);
                        if (!existingBinding) {
                            // We don't already have a binding for this property / bindingType pair.
                            // The path options apply; does the definition match this property type?
                            if (!tokenizedAbsPath) {
                                // The path we took to get here may have gone through a reference; we need the direct path.
                                const absPath = property.getAbsolutePath().substr(1);
                                tokenizedAbsPath = PathHelper.tokenizePathString(absPath);
                            }
                            const unnormalizedPath = in_path.substr(1);
                            const fakeContext = this._createFakeTraversalContext(
                                property,
                                unnormalizedPath,
                                tokenizedAbsPath,
                                in_treeNode);
                            fakeContext.getUserData().createdBindings = [];
                            if (this._createBindingFromDefinition(fakeContext, definitions[0], rule.activationInfo)) {
                                // A binding was created -- call back for postCreate
                                io_instantiatedBindings.push(fakeContext as any);
                            }
                        } else {
                            if (!(existingBinding instanceof definitions[0].bindingConstructor)) {
                                console.warn(
                                    'Specializing a DataBinding after DataBindings have already been instantiated for bindingType: ',
                                    rule.bindingType
                                );
                            } else {
                                (existingBinding as DataBinding)._incReferenceCount();
                            }
                        }
                    }
                }

                // We recurse if another binding wants to recurse, or we want to recurse.
                recurse = recurse || thisRecurse;
            });

            return recurse;
        };

        // Traverse the hierarchy and instantiate bindings
        recursivelyVisitHierarchy(
            in_rootPropertyElement, in_rootPropertyElement.getAbsolutePath(), this._dataBindingTree, generalVisitor
        );
    }

    /**
     * Recursively creates data bindings on existing properties for the provided registration handles. We create them
     * in a depth-first fashion.
     *
     * @param in_activationRules - The array of rules to apply bindings for
     *
     * @private
     * @hidden
     */
    private _createBindingsRetroactively(in_activationRules: ActivationType[]) {
        const instantiated = [];

        // Find all the path roots to start recursing from. We end with all the deepest starting
        // points for the set of handles.
        const pathRoots = minimalRootPaths(_.map(in_activationRules, 'startPath'));

        // Batch the rules based on these roots. Some of these rules may be a simple traversal to do, while
        // others may require careful checking of references etc.
        const rootsToRules: Record<string, ActivationType[]> = {};
        for (let i = 0; i < pathRoots.length; ++i) {
            const rules: ActivationType[] = [];
            for (let j = 0; j < in_activationRules.length; j++) {
                if (in_activationRules[j].startPath.indexOf(pathRoots[i]) === 0) {
                    // This rule is encompassed in this subtree
                    rules.push(in_activationRules[j]);
                }
            }
            rootsToRules[pathRoots[i]] = rules;
        }

        // For each root, recursively traverse the property hierarchy and instantiate bindings.
        _.each(rootsToRules, (in_rules: ActivationType[], in_root: string) => {
            const out_pathDelimiters = [];
            const pathArr = PathHelper.tokenizePathString(in_root, out_pathDelimiters);
            if (in_root[0] === '/') {
                pathArr.shift();
            }

            // we need to resolve the references along the way to our subtree but not at the leaf!
            const subTreeRootElement = new PropertyElement(this._propertyTree!.root);
            subTreeRootElement.becomeChild(pathArr, RESOLVE_NO_LEAFS, out_pathDelimiters);

            // Only recurse if the property exists. If it is not there, it is bad user input
            if (subTreeRootElement.isValid()) {
                // If there are no exactpaths (which may go through references, exclude prefixes, and all of the
                // paths start at the same root, we can use a significantly leaner traverser.
                const easy = _.every(in_rules,
                    (rule) => rule.exactPath === '' && rule.excludePrefix === '' && rule.startPath === in_root
                );
                if (easy) {
                    this._fastCreateRetroactive(subTreeRootElement, in_rules, instantiated);
                } else {
                    this._generalCreateRetroactive(subTreeRootElement, in_rules, instantiated);
                }
            }
        });

        // Call post create on all the DataBindings, in reverse order
        for (let i = 0; i < instantiated.length; ++i) {
            const context = instantiated[instantiated.length - 1 - i];
            this._postCreateDataBinding(context);
        }
    }

    /**
     * Remove all the bindings that were created for the provided activation rule. If the binding was created due to
     * two activations, it will not be removed, it will simply be derefed.
     *
     * @param in_activationRule - The description of the activation
     *
     * @private
     * @hidden
     */
    _unbindActiveBindings(in_activationRule: ActivationType) {
        const dataBinder = this;
        const removedBindings: Array<{
            tokenizedPath: (string | number)[],
            context: RemovalContext,
            binding: DataBinding
        }> = [];
        const bindingType = in_activationRule.bindingType;

        const visit: RecursiveCallback = function(in_propertyElement: PropertyElement, in_path: string, in_tokenizedPath: (string|number)[], in_dataBindingTreeNode: NodeType): boolean {
            if (in_activationRule.excludePrefix !== '' && in_path === in_activationRule.excludePrefix) {
                // Falls under our exclusion path: don't check this property, and don't recurse
                return false;
            }

            const value = in_dataBindingTreeNode ? in_dataBindingTreeNode.getValue() : undefined;
            if (value && value.ordered) {
                // Find the binding with this binding type
                const index = _.findIndex(value.ordered, (binding: DataBinding) => (binding.getDataBindingType() === bindingType));
                if (index !== -1) {
                    // We have found a databinding that was created for this binding type. Decrement the reference count
                    const dataBinding = value.ordered[index];
                    if (dataBinding._decReferenceCount() === 0) {
                        // Last one out; remove the databinding.
                        // the removalContext is dependent on the DataBinding so we need to create a new one for each binding
                        const removalContext = new RemovalContext(in_dataBindingTreeNode, dataBinding, in_path, true);

                        // Push in 'removedBindings' to do the onRemove call after all the pre-removes are done.
                        removedBindings.push({
                            tokenizedPath: in_tokenizedPath.slice(),
                            context: removalContext,
                            binding: dataBinding
                        });

                        // Call pre-remove on the binding
                        dataBinding._onPreRemove(removalContext);
                        if (dataBinding.onPreRemove !== DataBinding.prototype.onPreRemove) {
                            dataBinding.onPreRemove(removalContext);
                        }

                        value.ordered.splice(index, 1);

                        // If we removed the last reference count to it, delete from the map of data binding types as well
                        value.groupedByDataBindingType!.delete(bindingType);
                    }
                }
            }

            // Do not recurse for references, or primitive containers
            let recurse = !TypeIdHelper.isReferenceTypeId(in_propertyElement.getTypeId());
            recurse = recurse && !in_propertyElement.isPrimitiveCollection();
            return recurse;
        };

        const startPath = in_activationRule.startPath;
        const out_pathDelimiters: TOKEN_TYPES_TYPE[] = [];
        const pathArr = PathHelper.tokenizePathString(startPath.substr(1), out_pathDelimiters);
        // we need to resolve the references along the way to our subtree but not at the leaf!
        const subTreeRootElement = new PropertyElement(this._propertyTree!.root);
        subTreeRootElement.becomeChild(pathArr, RESOLVE_NO_LEAFS, out_pathDelimiters);

        if (!subTreeRootElement.isValid()) {
            // Nothing to do, the property was never created
        } else {
            if (in_activationRule.exactPath === '') {
                // No precise path, visit recursively
                recursivelyVisitHierarchy(subTreeRootElement, startPath, this._dataBindingTree, visit);
            } else {
                // Visit the one node for the exact path
                const dataBindingTreeNode = dataBinder._dataBindingTree.getNodeForTokenizedPath(pathArr);
                visit(subTreeRootElement, startPath, pathArr, dataBindingTreeNode);
            }
        }

        // Call onRemove on all the DataBindings, in reverse order
        for (let i = removedBindings.length - 1; i >= 0; i--) {
            const binding = removedBindings[i].binding;
            const removalContext = removedBindings[i].context;
            const tokenizedPath = removedBindings[i].tokenizedPath;

            // we'll call remove callbacks first
            binding._invokeRemoveCallbacks(tokenizedPath, true);
            if (binding.onRemove !== DataBinding.prototype.onRemove) {
                binding.onRemove(removalContext);
            }
            // we'll call our (base class) _onRemove last
            binding._onRemove(removalContext);
            if (!(binding instanceof dataBinder._AbsolutePathDataBinding)) {
                this._dataBindingRemovedCounter++;
            }
        }
    }

    /**
     * Returns all items in the tree corresponding to a certain bindingType.
     * NOTE: This is very inefficient, and only for internal testing
     *
     * @param in_bindingType - name of the bindingType
     * @returns the found items
     * @private
     * @hidden
     */
    _getDataBindingsByType(in_bindingType: string): Array<DataBinding> {
        let dataBindings: DataBinding[] = [];
        this._dataBindingTree.forEachChild(function(value) {
            if (value) {
                let dataBinding = value.groupedByDataBindingType.get(in_bindingType);
                if (dataBinding) {
                    dataBindings.push(dataBinding);
                }
            }
        });
        return dataBindings;
    }

    /**
     * Registers a handler that is called every time a change affects a given absolute path
     * that is known to exist and does not contain any references.
     *
     * @param in_absolutePath - Path to register the handler for
     * @param in_operations The operations for which the callback function gets called
     *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove',
     *     'referenceInsert', 'referenceModify', 'referenceRemove')
     * @param in_callback - The callback to invoke
     * @param in_options -  Additional user specified options for the
     *     callback and its registration
     * @returns A handle that can be used to unregister the callback
     * @private
     * @hidden
     */
    _registerOnSimplePath(in_absolutePath: string, in_operations: Array<string>, in_callback: Function, in_options: IRegisterOnPathOptions = {}): DataBinderHandle {
        if (in_options.replaceExisting !== undefined) {
            console.warn('replaceExisting is deprecated. The behavior is now as if replaceExisting is false');
        }

        let dataBindingNode: NodeType = this._dataBindingTree.getNode(in_absolutePath);
        if (!dataBindingNode) {
            dataBindingNode = this._dataBindingTree.insertNodeForPathCallback(in_absolutePath);
        } else {
            // if the node already exists, we need to make sure we flag it correctly as containing a path callback
            this._dataBindingTree.setNodeForPathCallback(in_absolutePath);
        }

        const dataBinder = this;
        const isDeferred = in_options.isDeferred;
        let value = dataBindingNode!.getValue();
        if (!value) {
            dataBindingNode!.setValue({});
            value = dataBindingNode!.getValue()!;
        }

        if (!value.pathCallbacks) {
            value.pathCallbacks = {};
        }
        let callback;
        if (isDeferred) {
            callback = function(context) {
                dataBinder.requestChangesetPostProcessing(in_callback.bind(null, context));
            };
        } else {
            callback = in_callback;
        }
        for (let i = 0; i < in_operations.length; i++) {
            assertOperation(in_operations[i]);
            value.pathCallbacks[in_operations[i]] = value.pathCallbacks[in_operations[i]] || [];
            value.pathCallbacks[in_operations[i]].push({ pathCallback: callback });
        }
        const registrationInfo = {
            operations: in_operations,
            path: in_absolutePath,
            pathCallback: callback
        };
        return new DataBinderHandle(this._unregisterOnSimplePath.bind(this), registrationInfo);
    }

    /**
     * Unregisters an absolute path listener.
     *
     * @param in_handle - The handle returned by registerOnPath
     * @param in_registrationInfo - the information describing the registerOnPath, to unregister with.
     * @hidden
     */
    private _unregisterOnSimplePath(in_handle: DataBinderHandle, in_registrationInfo: any) {
        const dataBindingNode = this._dataBindingTree.getNode(in_registrationInfo.path)!;
        const value = dataBindingNode.getValue()!;
        const operationKeys = in_registrationInfo.operations;

        for (let i = 0; i < operationKeys.length; i++) {
            const operationCallbacks = value.pathCallbacks![operationKeys[i]];
            if (operationCallbacks) {
                for (let j = 0; j < operationCallbacks.length; j++) {
                    if (operationCallbacks[j].pathCallback === in_registrationInfo.pathCallback) {
                        operationCallbacks.splice(j, 1);
                        if (operationCallbacks.length === 0) {
                            delete value.pathCallbacks![operationKeys[i]];

                            // TODO: Remove nodes from DataBinding tree, if no corresponding nodes in the property tree exist...
                            // 1. check the children if they have anything registered
                            // 2. check if there is no corresponding property
                            // If these both hold, delete this node -- and potentially recursively delete the parent node(s) as well
                            // Use DataBindingTree.prototype.getNodesInPath() for this above (instead of getNode() !)
                        }
                        break;
                    }
                }
            }
        }
    }

    /**
     * Registers a handler that is called every time a change affects the property at the given path
     * from the root of the PropertyTree.
     *
     * @example
     * @snippet javascript 'test/data_binder/absolute_path.spec.js'
     *      SnippetStart{DataBinder.registerOnPath} SnippetEnd{DataBinder.registerOnPath}
     *
     * @param in_absolutePath - Path(s) to register the handler for, relative to
     *     the root of the PropertyTree
     * @param in_operations - the operations for which the callback function gets called
     *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove',
     *     'referenceInsert', 'referenceModify', 'referenceRemove')
     * @param in_callback - The callback to invoke when the operation occurs
     * @param in_options -  Additional user specified options for the
     * callback and its registration
     * @returns A handle that can be used to unregister the callback.
     * @public
     */
    registerOnPath(in_absolutePath: string | Array<string>, in_operations: Array<string>, in_callback: Function, in_options: IRegisterOnPathOptions = {}): DataBinderHandle {
        let resultHandle;

        this.pushBindingActivationScope();

        // We need to ensure that the callback _first_ checks if it is being called for more than one
        // changeset, and _then_ defer. If we defer first, and the callback is called multiple times, they
        // may be for different changesets.
        // So, we first wrap it in a defer and then wrap it in the once-per-changeset check.
        let callback = in_callback;
        if (in_options.isDeferred) {
            callback = deferCallback(callback);
        }
        const newOptions = _.omit(in_options, 'isDeferred');

        try {
            if (_.isArray(in_absolutePath) && in_absolutePath.length > 1) {
                callback = makeCallbackOncePerChangeSet(callback);
                const allHandles: DataBinderHandle[] = [];
                in_absolutePath.forEach((path) => {
                    const handle = this._internalRegisterOnPath(path, in_operations, callback, newOptions);
                    allHandles.push(handle);
                });
                resultHandle = new DataBinderHandle(function() {
                    allHandles.forEach((handle) => {
                        handle.destroy();
                    });
                });
            } else if (_.isArray(in_absolutePath)) {
                resultHandle = this._internalRegisterOnPath(in_absolutePath[0], in_operations, callback, newOptions);
            } else {
                resultHandle = this._internalRegisterOnPath(in_absolutePath, in_operations, callback, newOptions);
            }
        } catch (err) {
            throw err;
        } finally {
            this.popBindingActivationScope();
        }

        return resultHandle;
    }

    /**
     * Registers a handler that is called every time a change affects the property at the given path
     * from the root of the workspace.
     *
     * @param in_absolutePath - Path to register the handler for, relative to
     *     the root of the workspace.
     * @param in_operations -
     *     the operations for which the callback function gets called
     *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove',
     *     'referenceInsert', 'referenceModify', 'referenceRemove')
     * @param in_callback - The callback to invoke when the operation occurs
     * @param in_options -  Additional user specified options for the
     *   callback and its registration
     * @returns A handle that can be used to unregister the callback.
     * @hidden
     */
    private _internalRegisterOnPath(in_absolutePath: string, in_operations: Array<string>, in_callback: Function, in_options: IRegisterOnPathOptions = {}): DataBinderHandle {
        if (in_options.replaceExisting !== undefined) {
            // @TODO remove this
            console.warn('replaceExisting is deprecated. The behavior is now as if replaceExisting is false');
        }

        // Now register a _relative_ path on this temporary class
        let relativePath = in_absolutePath;
        if (relativePath[0] === '/') {
            relativePath = relativePath.substr(1);
        }
        const callbackOptions: CallbackOptions = {
            isDeferred: !!in_options.isDeferred!
        };

        // Note; for performance reasons we allow adding registrations on this._AbsolutePathDataBinding despite the
        // fact that it is already registered with the DataBinder
        const handle = DataBinding.prototype._registerOnPath(
            this._AbsolutePathDataBinding, relativePath, in_operations, in_callback, callbackOptions
        );

        // Get the instance of _AbsolutePathDataBinding -- may not exist yet if not attached, or in a push
        // scope
        const dataBinding = this.resolve<DataBinding>('/', _INTERNAL_DATA_BINDINGTYPE) as DataBinding;
        if (dataBinding) {
            const tokenizedPath = PathHelper.tokenizePathString(relativePath);

            // We look to see if the property, or any property along the path, already exists.
            // We handle the case where only a property along the path exists to give the reference-handling
            // code to insert any callbacks for changes to the reference.
            let property = this._propertyTree!.root;
            let partiallySucceeded = tokenizedPath.length === 0;
            for (let i = 0; i < tokenizedPath.length; ++i) {
                let childProperty;
                try {
                    // We try, first by resolving references. If that fails, we want to at least find the reference, hence 'never'
                    childProperty = property.get(tokenizedPath[i], RESOLVE_ALWAYS) ||
                        property.get(tokenizedPath[i], RESOLVE_NEVER);
                } catch (error) {
                    // Ignore. Why does the PropertyTree throw when you access arrays out of bounds?
                    // It doesn't for any other invalid access
                }
                if (!childProperty) {
                    tokenizedPath.length = i;
                    break;
                } else {
                    partiallySucceeded = true;
                    property = childProperty;
                }
            }
            if (partiallySucceeded) {
                // Retroactively send insert notifications
                // But we only want to send for this path.
                // Call the callbacks, but only for this handle
                const registeredPaths = this._AbsolutePathDataBinding.prototype._registeredPaths;
                let interestingPaths = {};

                // Build interestingPath in the correct format all the way down to the node we care about.
                for (let j = tokenizedPath.length - 1; j >= 0; --j) {
                    const parent = {};
                    parent[tokenizedPath[j]] = interestingPaths;
                    interestingPaths = parent;
                }
                dataBinding._invokeInsertCallbacksForPaths(
                    [], registeredPaths, dataBinding.getProperty()!, true, true, interestingPaths, handle
                );
            }
        }

        return handle;
    }

    /**
     * Attaches this DataBinder to the given Workspace. Any bindings that are registered will be
     * applied to the current contents of the workspace. Future ChangeSets produced by the Workspace
     * will be processed and the corresponding data bindings will be created, updated or removed as
     * appropriate.
     *
     * @param propertyTree - The Workspace to bind to.
     */
    attachTo(propertyTree: SharedPropertyTree) {
        if (this._onModifiedRegistrationKey) {
            // Don't mess with any definitions for bindings / activations
            this.detach(false);
        }

        this._propertyTree = propertyTree;
        this._onModifiedRegistrationKey = this._modifyScene.bind(this) as any;
        this._propertyTree.on('localModification', this._onModifiedRegistrationKey);

        this._buildDataBindingTree();

        // We have delayed bindings until attaching.
        this._checkDelayedBindings();
    }

    /**
     * Blindly build the databindingtree to match the property layout, during the startup, rather than building
     * it bit by bit based on the changeset.
     *
     * This will be removed in favour of a lazy mechanism in the future.
     *
     * @hidden
     */
    private _buildDataBindingTree() {
        const _recursiveStepBindingTree = (in_property, in_id?, in_parentNode?) => {
            let newNode;
            if (!in_parentNode) {
                // We're the root
                newNode = this._dataBindingTree;
            } else {
                newNode = in_parentNode.insertChild(in_id, in_property.getContext());
            }

            if (in_property.getIds && in_property.getTypeid() !== 'String' && !isPrimitiveCollection(in_property)) {
                const ids = in_property.getIds();
                for (let i = 0; i < ids.length; ++i) {
                    const child = in_property.get(ids[i], RESOLVE_NEVER);
                    _recursiveStepBindingTree(child, ids[i], newNode);
                }
            }
        };

        _recursiveStepBindingTree(this._propertyTree!.root);
    }

    /**
     * Detaches from a Workspace if currently bound. All existing data bindings instances will
     * be destroyed as if the properties had been removed from the workspace.
     *
     * If in_unregisterAll is true (the default), all DataBindings are undefined and deactivated.
     * If false, it will leave them, and when attaching to a new Workspace, the DataBindings will
     * be applied.
     *
     * @param in_unregisterAll if true (the default), all DataBindings are undefined and
     *   deactivated. If false, they remain, and will apply
     */
    detach(in_unregisterAll: boolean | undefined = true) {
        // We visit every activation, and destroy any bindings that were created for it,
        // and then transfer the activation to the _delayedActivationHandles list in case
        // we reconnect to a workspace.
        // This is simulating all the properties being removed from the workspace
        const dataBinder = this;
        this.pushBindingActivationScope();

        this._activationHandlesByBindingType.forEach(function(in_handles, in_key) {
            for (let i = 0; i < in_handles.length; ++i) {
                dataBinder._unbindActiveBindings(in_handles[i].getUserData());
                dataBinder._delayedActivationHandles.add(in_handles[i]);
            }
        });

        // These have all been transferred to the _delayedActivationHandles list
        this._activationHandlesByBindingType = new Map();

        // Kill all the representations that were instantiated. We leave all the registered makers.
        this._recursivelyDestroyAllRepresentations();

        if (in_unregisterAll) {
            this.unregisterDataBindings();

            this._representationGenerators = new Map();
            this._representationHandlesByBindingType = new Map();
        }

        if (this._onModifiedRegistrationKey) {
            this._propertyTree!.off('localModification', this._onModifiedRegistrationKey);
            this._onModifiedRegistrationKey = null;
            this._propertyTree = undefined;
        }

        this.popBindingActivationScope();
    }

    /**
     * Helper function to deactivate all bindings of the given binding type (this is a helper to avoid calling destroy()
     * on all the handles returned by activateDataBinding)
     *
     * @param in_bindingType - the binding type to deactivate.
     *
     * @private
     * @hidden
     */
    private _deactivateDataBindings(in_bindingType?: string) {
        this.pushBindingActivationScope();

        let keys = in_bindingType ? [in_bindingType] : [...this._activationHandlesByBindingType.keys()];
        keys = keys.filter((key) => key !== _INTERNAL_DATA_BINDINGTYPE);
        keys.forEach((in_currBindingType) => {
            const handles = this._activationHandlesByBindingType.get(in_currBindingType) || [];
            while (handles.length) {
                handles[0].destroy();
            }
        });
        this._delayedActivationHandles.forEach(function(in_handle) {
            if ((!in_bindingType || in_handle.getUserData().bindingType === in_bindingType) &&
                in_handle.getUserData().bindingType !== _INTERNAL_DATA_BINDINGTYPE) {
                in_handle.destroy();
            }
        });

        this.popBindingActivationScope();
    }

    /**
     * Helper function to undefine all bindings of the given binding type (this is a helper to avoid calling destroy() on
     * all the handles returned by defineDataBinding).
     *
     * Note that any existing data bindings will remain until the associated activation is deactivated.
     *
     * @param iun_bindingType - the binding type to undefine. If none provided, all data bindings
     *   will be removed.
     *
     * @hidden
     */
    private _undefineDataBindings(in_bindingType: string) {

        this.pushBindingActivationScope();

        let keys = in_bindingType ? [in_bindingType] : [...this._definitionsByBindingType.keys()];
        keys = keys.filter((key) => key !== _INTERNAL_DATA_BINDINGTYPE);
        keys.forEach((in_currBindingType) => {
            const handles = this._definitionsByBindingType.get(in_currBindingType) || [];
            while (handles.length) {
                handles[0].destroy();
            }
        });

        this.popBindingActivationScope();
    }

    /**
     * Helper function that will deactivate all bindings of a particular bindingType, and
     * undefine any DataBindings of that bindingType.
     *
     * Note that {@link DataBinder.defineDataBinding} also returns a {@link DataBinderHandle} that can be
     * used for unregistering DataBindings.
     *
     * @param in_bindingType - the binding type for which to unregister. If not provided (the default), all
     * bindings associated with this DataBinder are affected.
     * @param in_deactivate - if true (the default), deactivate any activations for this binding type,
     *  created from {@link DataBinder.activateDataBinding} or {@link DataBinder.register}
     * @param in_undefine - if true (the default), undefine all bindings for this binding type
     *    {@link DataBinder.defineDataBinding} or {@link DataBinder.register}
     *
     * @public
     */
    unregisterDataBindings(
        in_bindingType?: string, in_deactivate: boolean = true, in_undefine: boolean = true
    ) {
        this.pushBindingActivationScope();

        if (in_deactivate) {
            this._deactivateDataBindings(in_bindingType);
        }
        if (in_undefine) {
            this._undefineDataBindings(in_bindingType!);
        }

        this.popBindingActivationScope();
    }

    /**
     * Return true if this DataBinder is attached to a Workspace.
     *
     * @returns True if the DataBinder is attached to a Workspace.
     * @public
     */
    isAttached(): boolean {
        return !!this._propertyTree;
    }

    /**
     * Create the data binding from the provided definition at the given path.
     * If it already exists, undefined is returned
     *
     * @param in_context - the current traversal context
     * @param in_definition - the binding definition (constructor etc)
     * @param in_activationInfo - information such as binding type, userData, databinder
     *                             shared amongs all instances of the binding of this definition.
     *
     * @returns The instantiated binding, unless it already exists
     * @private
     * @hidden
     */
    _createBindingFromDefinition(in_context: Utils.TraversalContext, in_definition: ActivationType, in_activationInfo: object): DataBinding | undefined {
        let property = in_context.getUserData().property;

        // Check if it has already been instantiated
        let node = in_context.getUserData().dataBindingTreeNode;
        let nodeValue = node.getValue();
        if (nodeValue && nodeValue.groupedByDataBindingType) {
            const existing = nodeValue.groupedByDataBindingType.get(in_definition.bindingType);
            if (existing) {
                // Already there, increment the refcount.
                existing._incReferenceCount();

                return undefined;
            }
        }

        // Create the node value immediately; in case the constructor calls getRepresentation.
        if (!nodeValue) {
            nodeValue = {};
            node.setValue(nodeValue);
        }

        const modificationContext = ModificationContext._fromContext(in_context);
        const binding = new in_definition.bindingConstructor!({
            property: property,
            // @ts-ignore
            modificationContext: modificationContext, // @TODO redundant param ?
            activationInfo: in_activationInfo
        });
        binding._incReferenceCount();

        in_context.getUserData().createdBindings.push(binding);

        nodeValue.groupedByDataBindingType = nodeValue.groupedByDataBindingType || new Map();
        nodeValue.groupedByDataBindingType.set(in_definition.bindingType, binding);

        nodeValue.ordered = nodeValue.ordered || [];
        nodeValue.ordered.push(binding);

        if (!(binding instanceof this._AbsolutePathDataBinding)) {
            this._dataBindingCreatedCounter++;
        }

        return binding;
    }

    /**
     * Internal function to instantiate all the data bindings at the given path
     *
     * @param in_context - The traversal context
     * @param in_path - Path of the property to create the data bindings for
     * @hidden
     */
    private _createAllBindingsAtPath(in_context: Utils.TraversalContext, in_path: string) {
        let property = in_context.getUserData().property;
        const propertyTypeId = property.getFullTypeid();
        const propertySplitType = TypeIdHelper.extractContext(propertyTypeId);

        let definitions = this._registry.getApplicableBindingDefinitions(
            property.getFullTypeid(), undefined, this._propertyTree
        );

        if (definitions.length === 0) {
            // No applicable bindings to create for this property
            return;
        }

        in_context.getUserData().createdBindings = [];

        // Create the corresponding DataBindings and add them to the DataBinding tree
        const dataBinder = this;
        definitions.forEach(function(in_definition) {
            // Get all the activations that apply to this binding type
            const activations = dataBinder._activationHandlesByBindingType.get(in_definition.bindingType) || [];
            for (const handle of activations) {
                const rule = handle.getUserData();
                // Is this definition activated?
                if (!dataBinder._activationAppliesToTypeId(
                    rule.activationSplitType,
                    propertySplitType,
                    in_definition.splitType)
                ) {
                    continue;
                }

                console.assert(in_path[0] !== '/');
                const comparePath = '/' + in_path;

                // if exactPath is specified, we only create DataBindings at that exact path
                let instantiate = true;
                if (rule.exactPath !== '' && comparePath !== rule.exactPath) {
                    instantiate = false;
                }

                // if excludePrefix is specified, check that the path does not start with it
                if (instantiate && rule.excludePrefix !== '' && comparePath.startsWith(rule.excludePrefix)) {
                    instantiate = false;
                }

                // if includePrefix is specified, check that the path does start with it
                if (instantiate && rule.includePrefix !== '' && !comparePath.startsWith(rule.includePrefix)) {
                    instantiate = false;
                }

                if (instantiate) {
                    // Note, we don't need to check if there are existing bindings; this code path is for new
                    // properties
                    dataBinder._createBindingFromDefinition(in_context, in_definition, rule.activationInfo);
                }
            }
        });
    }

    /**
     * Function that is invoked in the post-order traversal, if any data bindings have been created in the pre-order
     * traversal for this node. It will invoke the corresponding event handlers on the created data bindings
     *
     * @param in_context - Traversal context
     *
     * @private
     * @hidden
     */
    _postCreateDataBinding(in_context: Utils.TraversalContext) {
        let createdBindings = in_context.getUserData().createdBindings;
        let pathCallbackContext: any | undefined = undefined;
        if (createdBindings) {
            for (let i = 0; i < createdBindings.length; i++) {
                let modificationContext = ModificationContext._fromContext(in_context, createdBindings[i], []);
                createdBindings[i]._onPostCreate(modificationContext);
                if (createdBindings[i].onPostCreate !== DataBinding.prototype.onPostCreate) {
                    createdBindings[i].onPostCreate(modificationContext);
                }
                // we'll call the insert callbacks only after the user's onPostCreate() callback has been called
                createdBindings[i]._invokeInsertCallbacks(modificationContext);
                // TODO: Use the first registered DataBindings (if it exists) as "default" DataBinding for the absolute path
                // TODO: callbacks, maybe change it later?
                if (!pathCallbackContext) {
                    pathCallbackContext = modificationContext;
                }
            }
        }

        if (!in_context.getUserData().retroactive) {
            this._callPathCallbacks(in_context, pathCallbackContext);
        }
    }

    /**
     * @param in_context - The traversal context
     * @param in_modificationContext - The modification context
     *
     * @hidden
    */
    private _callPathCallbacks(in_context: Utils.TraversalContext, in_modificationContext?: ModificationContext) {
        const value = in_context.getUserData().dataBindingTreeNode.getValue();
        if (value && value.pathCallbacks) {
            if (!in_modificationContext) {
                in_modificationContext = ModificationContext._fromContext(in_context);
                // we need to pass the "previous" path so that we can forward it on to the callbacks later
                in_modificationContext._setRemovedDataBindingPath(in_context.getFullPath());
            }

            invokeCallbacks(
                undefined, // No databinding
                in_modificationContext,
                false,
                [],
                ++this._visitationIndex,
                in_context,
                value.pathCallbacks,
                [],
                false
            );
        }
    }

    /**
     * Removes a data binding from the DataBinding tree and invokes the onRemove and onPreRemove handlers for
     * all child data bindings
     *
     * @param in_parentNode -
     *     The parent node of the node to remove
     * @param in_index - Index to the node to remove
     * @param in_path - path leading to the parent node
     *
     * @hidden
     */
    private _removeDataBindings(in_parentNode: DataBindingTree | ArrayNode, in_index: string | number, in_path: string) {
        let subTree = in_parentNode.getChild(in_index as any);
        let that = this;

        let rootPath = in_parentNode instanceof ArrayNode ? '[' + in_index + ']' : in_index;
        const fullTokenizedPath = PathHelper.tokenizePathString(in_path);

        const reinsertions: any[] = [];
        let callback = function(post, value, tokenizedPath, dataBindingNode) {
            if (!value) {
                return;
            }
            let dataBindingPath = in_path || '';
            tokenizedPath.forEach((segment) => {
                const escapedSegment = _.isString(segment) ? PathHelper.quotePathSegmentIfNeeded(segment) : segment;
                if (dataBindingPath.length) {
                    dataBindingPath += '.' + escapedSegment;
                } else {
                    dataBindingPath = escapedSegment;
                }
            });
            if (value.ordered) {
                const oldLength = fullTokenizedPath.length;
                fullTokenizedPath.push(...tokenizedPath);
                value.ordered.forEach(function(dataBinding) {
                    let removalContext;
                    if (post) {
                        // the removalContext is dependent on the DataBinding so we need to create a new one for each DataBinding
                        removalContext = new RemovalContext(dataBindingNode, dataBinding, dataBindingPath, false);
                        // we'll call remove callbacks first
                        dataBinding._invokeRemoveCallbacks(fullTokenizedPath, false);
                        if (dataBinding.onRemove !== DataBinding.prototype.onRemove) {
                            dataBinding.onRemove(removalContext);
                        }
                        // we'll call our (base class) _onRemove last
                        dataBinding._onRemove(removalContext);
                        if (!(dataBinding instanceof that._AbsolutePathDataBinding)) {
                            that._dataBindingRemovedCounter++;
                        }
                        let bindingType = dataBinding.getDataBindingType();
                        // add the deleted DataBinding to our removed DataBindings map so that callbacks can get this later
                        if (!that._removedDataBindings.has(dataBindingPath)) {
                            that._removedDataBindings.set(dataBindingPath, {
                                groupedByDataBindingType: new Map(),
                                ordered: []
                            });
                        }
                        let currentPathObject = that._removedDataBindings.get(dataBindingPath);
                        currentPathObject.groupedByDataBindingType.set(bindingType, dataBinding);
                        currentPathObject.ordered.push(dataBinding);
                    }
                    if (!post) {
                        removalContext = new RemovalContext(dataBindingNode, dataBinding, dataBindingPath, false);
                        dataBinding._onPreRemove(removalContext);
                        if (dataBinding.onPreRemove !== DataBinding.prototype.onPreRemove) {
                            dataBinding.onPreRemove(removalContext);
                        }
                    }
                });
                fullTokenizedPath.length = oldLength;
            }

            if (!post && value.pathCallbacks) {
                if (value.pathCallbacks['remove']) {
                    // TODO: Use the first registered DataBinding (if it exists) as "default" DataBinding for the absolute path
                    // TODO: callbacks, maybe change it later?
                    let pathCallbackContext: any = undefined;
                    if (value.ordered && value.ordered.length > 0) {
                        pathCallbackContext = new RemovalContext(dataBindingNode, value.ordered[0], dataBindingPath, false);
                    } else {
                        pathCallbackContext = new RemovalContext(dataBindingNode, undefined, dataBindingPath, false);
                    }
                    // Call the remove handler for the path callbacks
                    for (let i = 0; i < value.pathCallbacks['remove'].length; i++) {
                        value.pathCallbacks['remove'][i].pathCallback(pathCallbackContext);
                    }
                }
                // Keep the callbacks in the tree
                let insertionPath = rootPath;
                tokenizedPath.forEach((segment) => {
                    const escapedSegment = _.isString(segment) ? PathHelper.quotePathSegmentIfNeeded(segment) : segment;
                    if ((insertionPath as string).length) {
                        insertionPath += '.' + escapedSegment;
                    } else {
                        insertionPath = escapedSegment;
                    }
                });
                reinsertions.push({
                    path: insertionPath,
                    data: {
                        pathCallbacks: value.pathCallbacks
                    }
                } as any);
            }

            if (post) {
                that._destroyAllRepresentationsAtNode(dataBindingNode);
            }
        };

        // Notify the subtree
        if (subTree) {
            subTree.forEachChild(
                callback.bind(that, false),
                callback.bind(that, true)
            );
        }

        // Only remove the subtree after the callbacks have all been called.
        in_parentNode.removeChild(in_index as number);

        // Reinsert any remove callbacks
        reinsertions.forEach((entry) => {
            in_parentNode.insertNodeForPathCallback(entry.path, entry.data);
        });
    }

    /**
     * Handle a (single) modify while traversing a ChangeSet
     *
     * @param in_context  - the traversal context
     * @param in_post         - true if called post-order
     * @private
     * @hidden
     */
    _handleModify(in_context: Utils.TraversalContext, in_post: boolean) {
        let node = in_context.getUserData().dataBindingTreeNode;
        if (node && node.getValue()) {
            let orderedDataBindings = node.getValue().ordered;
            let modificationContext;
            let pathCallbackContext = undefined;
            if (orderedDataBindings) {
                for (let i = 0; i < orderedDataBindings.length; i++) {
                    modificationContext = ModificationContext._fromContext(in_context, orderedDataBindings[i], []);
                    // TODO: Use the first registered DataBinding (if it exists) as "default" DataBinding for the absolute path
                    // TODO: callbacks, maybe change it later?
                    if (!pathCallbackContext) {
                        pathCallbackContext = modificationContext;
                    }
                    // we need to pass the "previous" path so that we can forward it on to the callbacks later
                    modificationContext._setRemovedDataBindingPath(in_context.getFullPath());
                    if (in_post) {
                        orderedDataBindings[i]._onModify(modificationContext);
                        if (orderedDataBindings[i].onModify !== DataBinding.prototype.onModify) {
                            orderedDataBindings[i].onModify(modificationContext);
                        }
                        // we'll call the modify callbacks only after the user's onModify() callback has been called (LYNXDEV-5746)
                        orderedDataBindings[i]._invokeModifyCallbacks(modificationContext);
                    } else {
                        orderedDataBindings[i]._onPreModify(modificationContext);
                        if (orderedDataBindings[i].onPreModify !== DataBinding.prototype.onPreModify) {
                            orderedDataBindings[i].onPreModify(modificationContext);
                        }
                    }
                }
            }
            if (in_post) {
                this._callPathCallbacks(in_context, pathCallbackContext);
            }
        }
    }

    /**
     * Handle a (single) removal while traversing a ChangeSet
     *
     * @param in_context  - the traversal context
     * @param in_post     - true if called post-order
     * @param in_tokenizedPathSegments - the tokenized path segments from the last existing
     *                                                           DataBindingTree node
     * @private
     * @hidden
     */
    _handleRemove(in_context: Utils.TraversalContext, in_post: boolean, in_tokenizedPathSegments: string | Array<string | number>) {
        if (!in_post) {
            let fullPath = in_context.getFullPostPath();
            let that = this;

            // notify potential parent DataBindings
            // TODO: what if in_tokenizedPathSegments is an array? Can it ever be an array for a 'remove' operation?
            console.assert(!_.isArray(in_tokenizedPathSegments));
            let oldNode = in_context.getUserData().oldTreeNode;
            console.assert(this._dataBindingTree.getNode(fullPath) === oldNode.getChild(in_tokenizedPathSegments));

            // we need to use the "previous" path here as well to be consistent with the array case
            that._removeDataBindings(oldNode, in_tokenizedPathSegments as string, in_context.getFullPath());
            in_context.getUserData().dataBindingTreeNode = null;
        }
    }

    /**
     * Handle a (single) insertion while traversing a ChangeSet
     *
     * @param in_context               - the traversal context
     * @param in_post                  - true if called post-order
     * @param in_tokenizedPathSegments - the tokenized path segments from the last
     *                                                                 existing DataBindingTree node
     * @param in_propertyContext       - Context of the object to insert
     * @private
     * @hidden
     */
    _handleInsert(in_context: Utils.TraversalContext, in_post: boolean,
        in_tokenizedPathSegments: string | Array<string>, in_propertyContext: string) {

        if (in_post) {
            // Invoke the post creation handlers
            this._postCreateDataBinding(in_context);
        } else {
            // TODO: do we really add nodes for every property or just the ones where we want DataBindings as well?
            // TODO: for now add nodes for every property so that our tree accurately reflects the PSet tree.
            // TODO: We may revisit this later

            // Insert a new node into the tree
            let oldTreeNode = in_context.getUserData().oldTreeNode;
            let newTreeNode = oldTreeNode.insertChild(in_tokenizedPathSegments, in_propertyContext);

            // Update the new dataBindingTreeNode setting
            in_context.getUserData().dataBindingTreeNode = newTreeNode;

            // Create the bindings for this property
            let postPath = in_context.getFullPostPath();
            this._createAllBindingsAtPath(in_context, postPath);
        }
    }

    /**
     * Handle a (single) change while traversing a ChangeSet
     *
     * @param in_context - the traversal context
     * @param in_post - true if called post-order
     * @private
     * @hidden
     */
    _handleChange(in_context: Utils.TraversalContext, in_post: boolean) {
        // remove is handled independently of anything else
        // 'NodeProperty', 'map', 'array', 'set', 'template', 'root'
        //    console.log(opType + ' for type: ' + splitType.typeid + ' at: ' + fullPath + ' context: ' + context);
        const opType = in_context.getOperationType();
        const containerType = in_context.getPropertyContainerType();
        const tokenizedPathSegments = in_context.getUserData().tokenizedPathSegments;
        if (containerType === 'NodeProperty' ||
            containerType === 'template' ||
            containerType === 'root' ||
            containerType === 'map' ||
            containerType === 'set' ||
            containerType === 'array') {
            if (opType === 'insert') {
                let splitType = in_context.getSplitTypeID();
                this._handleInsert(in_context, in_post, tokenizedPathSegments, splitType.context);
            } else if (opType === 'remove') {
                this._handleRemove(in_context, in_post, tokenizedPathSegments);
            } else {
                this._handleModify(in_context, in_post);
            }
        } else {
            throw new Error('should not get here... ' + containerType);
        }
        // console.log('---> callback out <---, post:', in_post);
    }

    /**
     * Pre-order callback for the recursive traversal
     *
     * @param in_context - Traversal context
     * @private
     * @hidden
     */
    _preTraversalCallBack(in_context: Utils.TraversalContext) {
        let opType = in_context.getOperationType();
        const delims = [];

        // compute current property and node
        let oldProperty = in_context.getUserData().property;
        let oldTreeNode = in_context.getUserData().dataBindingTreeNode;

        let tokenizedPathSegments: any = in_context.getPostLastSegment();
        if (in_context.getPropertyContainerType() === 'template') {
            const asString = tokenizedPathSegments.toString();
            if (asString.indexOf('.') !== -1 || asString.indexOf('"') !== -1) {
                tokenizedPathSegments = PathHelper.tokenizePathString(asString, delims);
            }
        }

        let newProperty;
        let newTreeNode;
        if (in_context.getPropertyContainerType() === 'root') {
            // we're still at the start
            newProperty = oldProperty;
            newTreeNode = oldTreeNode;
        } else {
            if (opType === 'remove') {
                newProperty = undefined;
                newTreeNode = oldTreeNode.getChild(tokenizedPathSegments, undefined, delims);
            } else {
                newProperty = oldProperty.get(tokenizedPathSegments, RESOLVE_NEVER);
                console.assert(newProperty);
                newTreeNode = oldTreeNode.getChild(tokenizedPathSegments, undefined, delims);
                if (!newTreeNode && opType !== 'insert') {
                    console.error('Unexpected error during ChangeSet processing. Probably Properties were modified inside a' +
                        ' callback. Please consider using dataBinder.requestChangesetPostProcessing() instead.');
                }
                if (!newTreeNode) {
                    newTreeNode = undefined;
                }
            }
        }

        _pushUserData(in_context, {
            property: newProperty,
            dataBindingTreeNode: newTreeNode,
            oldTreeNode: oldTreeNode,
            tokenizedPathSegments: tokenizedPathSegments
        });

        this.dataBinder._handleChange(in_context, false);
    }

    /**
     * Post-order callback for the recursive traversal. it's only used to create the actual Data Bindings.
     *
     * @param {TraversalContext} in_context - Traversal context
     * @private
     * @hidden
     */
    _postTraversalCallBack(in_context: Utils.TraversalContext) {
        this.dataBinder._handleChange(in_context, true);

        _popUserData(in_context);
    }

    /**
     * Traverses a ChangeSet recursively and invokes the callback for each visited property.
     *
     * @param in_changeSet  - The ChangeSet to process
     * @private
     * @hidden
     */
    _traverseChangeSet(in_changeSet: SerializedChangeSet) {
        let notifications = {
            insert: new Map(),
            remove: new Map(),
            modify: new Map(),
            dataBinder: this
        };
        let myUserData = {
            property: this._propertyTree!.root,
            dataBindingTreeNode: this._dataBindingTree,
            retroactive: false    // We are not retroactively installing bindings
        };

        // delete the notifications data from the previous traversal
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback: this._preTraversalCallBack.bind(notifications),
            postCallback: this._postTraversalCallBack.bind(notifications),
            userData: myUserData
        });
    }

    /**
     * Modify the scene according to the ChangeSet passed in. Traversal is depth first and recursively processes the
     * change set.
     *
     * For each section of the change set either an Data Binding exists (or will exist) or there is no data binding
     * representation.
     * If there is (or will be) a data binding, then a ModificationSet is created. This ModificationSet is passed along to
     * further processing of the change set until such time as it is no longer necessary. After the section of the change
     * set that created the ModificationSet is done processing, a copy of the ModificationSet is sent to each Data
     * Binding.
     *
     * If there is no data binding representation, the provided ModificationSet is added to and passed on for further
     * processing.
     *
     * @hidden
     *
     * @param  in_changeSet - ChangeSet describing the modification.
     * @throws Will throw an error if a traversal is already active.
     */
    private _modifyScene(in_changeSet: ChangeSet) {

        // Every changeset, we increment this counter. This allows us to ensure that some callbacks are only called
        // once per changeset.
        ++this._currentChangeSetId;

        // Perform the modifications on the scene recursively
        //    console.profile();
        if (this._activeTraversal) {
            throw new Error('Nested traversal is detected. Probably Properties were modified inside a' +
                ' callback. Please consider using dataBinder.requestChangesetPostProcessing() instead.');
        }
        this.pushBindingActivationScope();
        this._activeTraversal = true;
        try {
            let serializedChanges = in_changeSet.getSerializedChangeSet ? in_changeSet.getSerializedChangeSet() :
                in_changeSet;
            this._traverseChangeSet(serializedChanges);
        } catch (e) {
            // just rethrow
            throw e;
        } finally {
            this._activeTraversal = false;
            this.popBindingActivationScope();
        }

        // Clear our Map of deleted DataBindings - at this point all callbacks have been processed that needed them
        this._removedDataBindings.clear();

        // console.profileEnd();
    }

    /**
     * Do any requests that were queued up for post-changeset processing
     *
     * @hidden
     */
    private _postChangesetProcessing() {
        // We swap the queue out in case other things get added during the callback
        const queue = this._postProcessingCallbackQueue;
        this._postProcessingCallbackQueue = [];
        while (queue.length !== 0) {
            let callback = queue.pop()!;
            callback();
        }
    }

    /**
     * Return the data bindings (if any) that correspond to the given path or property. May be filtered by binding type.
     *
     * @param in_pathOrProperty - Absolute path to a data binding or property corresponding
     * to a data binding
     * @param in_bindingType  - The requested bindingType. If none has been given, all bindings will be
     *        returned
     *
     * @returns If no binding type is given then an array of data
     * bindings (either all in registration order or an empty array if no suitable bindings are present at the given path
     * or Property). If a binding type is given it's either a single data binding or undefined if no suitable bindings
     * are present at the given path or Property.
     *
     * @public
     */
    resolve<T=DataBinding>(in_pathOrProperty: string | BaseProperty, in_bindingType?: string): T | T[] | undefined {
        if (!in_pathOrProperty) {
            return (in_bindingType === undefined) ? [] : undefined;
        }

        let path: string;
        if (in_pathOrProperty instanceof BaseProperty) {
            path = in_pathOrProperty.getAbsolutePath();
        } else {
            path = in_pathOrProperty;
        }

        // Internally we store paths without the leading '/' character so we need to get rid of those
        if (path[0] === '/') {
            path = path.substr(1);
        }

        let node = this._dataBindingTree.getNode(path);
        if (node) {
            return (in_bindingType === undefined) ? node.getDataBindings() as any : node.getDataBindingByType(in_bindingType) as any;
        } else {
            return (in_bindingType === undefined) ? [] : undefined;
        }
    }

    /**
     * Return the removed Data Binding (if any) that correspond to the given path and type.
     * @param in_path       - absolute path to an data binding
     * @param in_bindingType - The requested bindingType
     * @returns A data binding (of the given
     * type) which may be undefined if no suitable data binding is present at the given path.
     * @package
     * @private
     * @hidden
     */
    _resolveRemovedDataBindingByType(in_path: string, in_bindingType: string): DataBinding | undefined {
        if (!in_path || !in_bindingType) {
            return undefined;
        }
        // Internally we store paths without the leading '/' character so we need to get rid of those
        if (in_path[0] === '/') {
            in_path = in_path.substr(1);
        }
        let removedDataBindingsForPath = this._removedDataBindings.get(in_path);
        if (removedDataBindingsForPath) {
            const groupedByType = removedDataBindingsForPath.groupedByDataBindingType.get(in_bindingType);
            if (groupedByType) {
                return groupedByType;
            }
        }
        return undefined;
    }

    /**
     * In callbacks such as registerOnPath, with DataBinder or DataBindings, the callbacks are being done
     * while processing the current change set. Currently, is is prohibited to do modifications to
     * the PropertyTree during one such callback.
     *
     * If a change to the PropertyTree is required in a callback, clients can use the ```requestChangesetPostProcessing```
     * function to call the provided callback to be called after the current change set is processed.
     *
     * There is no guarantee on the order the callbacks will be called in.
     *
     * @param in_callback - A post creation callback function for each data binding called
     *   after the ChangeSet has been processed
     * @param in_context - Optional value to be passed as
     *   the ```this``` parameter to the target function when the bound function is called
     * @public
     */
    requestChangesetPostProcessing(in_callback: Function, in_context?: any) {
        this._postProcessingCallbackQueue.push(in_callback.bind(in_context));
    }

    /**
     * Return the Workspace the DataBinder is currently attached to, or undefined if not attached.
     *
     * @returns The Workspace the DataBinder is attached to.
     * @public
     */
    getPropertyTree(): SharedPropertyTree | undefined {
        return this._propertyTree;
    }

    /**
     * Register a generator to be used to build a new runtime representation for the given bindingType / typeID.
     * The function will be called lazily based on calls to {@link DataBinder.getRepresentation}.
     * By design, the generator functions can themselves call getRepresentation for other properties in the system, and
     * their generators will be recursively built. The DataBinder will detect cycles in these inter-dependencies but
     * does not directly resolve them.
     * It is possible to define runtime representations for multiple levels of an inherited type. When
     * {@link DataBinder.getRepresentation} is called for a property, the most specialized runtime represenation
     * registered will be called. Care should be taken by the user to ensure all runtime representations are defined
     * before they begin to be built.
     *
     * @example
     * ```javascript
     * // Register a generator for runtime representations for the Dog Property
     * myDataBinder.defineRepresentation('PETSTORE', 'Types:Dog-1.0.0', (property) => new DogRepresentation());
     *
     * // Get a ShartedProperty tree and insert a new property
     * const propertyTree = getSharedPropertyTree();
     * myDataBinder.attachTo(propertyTree);
     *
     * propertyTree.root.insert('Fido', PropertyFactory.create('Types:Dog-1.0.0', 'single'));
     *
     * // Request the runtime representation associated with the property
     * const fido = myDataBinder.getRepresentation(workspace.root.get('Fido'), 'PETSTORE');
     * console.assert(fido instanceof DogRepresentation);
     * ```
     *
     * @param bindingType - The binding type to associate this runtime representation with. Allows multiple
     * runtime representations to be built for the same property.
     * @param typeID - The type id for which to generate this runtime representation. Care must be taken when
     * defining types that inherit from each other; all types should be registered before the runtime representations
     * begin to be created.
     * @param generator - Callback to create a new runtime representation for the provided
     * property. The bindingType, and the userData specified here in the options are provided to the callback function.
     * Note, if the creation needs to be broken into two states, see the options.initializer option.
     * @param options - Options block
     *
     * @returns A handle to permit unregistering of the runtime representation.
     *
     * @throws If there is already runtime representation associated with the provided bindingType/typeID.
     *
     * @public
     */
    defineRepresentation(bindingType: string, typeID: string, generator: representationGenerator, options: IDefineRepresentationOptions | undefined = {}): DataBinderHandle {
        let rules = this._representationGenerators.get(bindingType);
        if (!rules) {
            rules = new SemverMap();
            this._representationGenerators.set(bindingType, rules);
        }
        if (rules.has(typeID)) {
            throw new Error('A runtime representation generator has already been defined for this bindingType / typeID pair');
        }

        if (options.stateless && options.destroyer) {
            console.warn('Destroyer callback will be ignored for stateless representations');
        }

        const representationInfo = {
            bindingType: bindingType,
            typeID: typeID,
            generatorCallback: generator,
            destroyerCallback: options.stateless ? undefined : options.destroyer,
            initializerCallback: options.initializer,
            stateless: !!options.stateless,
            userData: options.userData
        };
        const handle = new DataBinderHandle(
            DataBinder.prototype._undefineRepresentation.bind(this),
            representationInfo
        );

        rules.add(typeID, options.upgradeType, handle);

        // We remember all the handles by binding type; this allows us to unregister them all using
        // undefineAllRepresentations.
        const allByBindingType = this._representationHandlesByBindingType.get(bindingType) || [];
        allByBindingType.push(handle);
        this._representationHandlesByBindingType.set(bindingType, allByBindingType);

        return handle;
    }

    /**
     * Unregister and destroy all the runtime representations associated with the given handle
     *
     * @param in_handle - the handle for this runtime representation definition
     * @param in_representationInfo - the runtime representation information
     *
     * @private
     * @hidden
     */
    _undefineRepresentation(in_handle: DataBinderHandle, in_representationInfo: any) {
        const rules = this._representationGenerators.get(in_representationInfo.bindingType);
        rules.remove(in_representationInfo.typeID);
        if (rules.size === 0) {
            this._representationGenerators.delete(in_representationInfo.bindingType);
        }

        const allByBindingType = this._representationHandlesByBindingType.get(in_representationInfo.bindingType) || [];
        const index = allByBindingType.indexOf(in_handle);
        console.assert(index !== -1);
        if (index !== -1) {
            allByBindingType.splice(index, 1);
        }

        if (!in_representationInfo.stateless) {
            const dataBinder = this;

            const visit: RecursiveCallback = (in_propElement: PropertyElement, in_path: string, in_tokenizedPath: (string | number)[], in_dataBindingTreeNode: NodeType): boolean => {
                if (!in_propElement.isPrimitiveCollectionElement() &&
                    in_propElement.getTypeId() === in_representationInfo.typeID) {
                    // Found a property that should have a runtime representation associated with it
                    const value = in_dataBindingTreeNode ? in_dataBindingTreeNode.getValue() : undefined;
                    if (value && value.representations) {
                        // Delete it if it is there
                        const representationEntry = value.representations.get(in_representationInfo.bindingType);
                        if (representationEntry) {
                            dataBinder._destroyRepresentation(
                                representationEntry.representation, representationEntry.representationInfo
                            );
                            value.representations.delete(in_representationInfo.bindingType);
                        }
                    }
                }

                if (in_propElement.isPrimitiveCollection()) {
                    // We don't want to recurse on each individual character/float of primitive containers; we cannot associate
                    // representations with these
                    return false;
                } else {
                    // Recursively visit children unless we are at a reference
                    return !in_propElement.isReference();
                }
            };

            // Visit the entire tree and remove all occurrences of this runtime representation.
            const rootElement = new PropertyElement(this._propertyTree!.root);
            recursivelyVisitHierarchy(rootElement, '/', this._dataBindingTree, visit);
        }
    }

    /**
     * Recursively destroy all the runtime representations currently instantiated
     *
     * @private
     * @hidden
     */
    _recursivelyDestroyAllRepresentations() {
        if (this._propertyTree) {
            const dataBinder = this;
            this._dataBindingTree.forEachChild(
                function(value, path, dataBindingNode) {
                    dataBinder._destroyAllRepresentationsAtNode(dataBindingNode);
                }
            );
        }
        // if we're detaching we shouldn't be building any stateless reps any longer
        console.assert(this._buildingStatelessRepresentations.size === 0);
        this._buildingStatelessRepresentations = new Map();
    }

    /**
     * Destroy all the instances of representations that are on this node
     *
     * @param in_node - the node we want to clear the representations from
     *
     * @private
     * @hidden
     */
    _destroyAllRepresentationsAtNode(in_node: DataBindingTree) {
        const value = in_node.getValue();
        const dataBinder = this;

        if (value && value.representations) {
            value.representations.forEach(function(representationEntry, bindingType) {
                dataBinder._destroyRepresentation(
                    representationEntry.representation, representationEntry.representationInfo
                );
            });
            delete value.representations;
        }
    }

    /**
     * Return the representation associated to the given property, for the particular binding type.
     * If the representation has not been built before, it will be created on the fly.
     *
     * NOTE/WARNING: If this property is inside a repository reference, this function can fail. In that case,
     * please use {@link DataBinder.getRepresentationAtPath} and use an explicit path.
     *
     * @param property - The property for which we want the runtime representation
     * @param bindingType - The binding type of the runtime representation
     *
     * @returns The initialized runtime representation, or undefined if there is none registered
     *
     * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
     * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder.defineRepresentation}
     * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
     * @throws If not connected to a workspace
     * @throws If the property is not in the workspace the DataBinder is attached to.
     * @throws If the given property is undefined
     *
     * @public
     */
    getRepresentation<T>(property: BaseProperty, bindingType: string): T | undefined {
        if (!this.isAttached()) {
            // Nice try
            throw new Error('Calling getRepresentation when not attached to a workspace');
        }
        if (!property) {
            // Nice try
            throw new Error('Calling getRepresentation with an undefined property');
        }
        return this._getRepresentationAtPathInternal(property.getAbsolutePath().substr(1), property, bindingType);
    }

    /**
     * Return the representation associated to the given path, for the particular binding type.
     * If the representation has not been built before, it will be created on the fly.
     *
     * @param path - The absolute path to the property for which we want the runtime representation.
     * @param bindingType - The binding type of the runtime representation.
     *
     * @returns the initialized runtime representation, or undefined if there is none registered
     *
     * @throws If there is a cycle in the generators for the creation of the runtime representations. Avoid the cyclic
     * calls, or use the 'initializer' option when specifying the generator in {@link DataBinder.defineRepresentation}
     * @throws If the generator or a recursively-used generator fails to return a runtime representation when called.
     * @throws If not connected to a workspace
     * @throws If the property does not exist at the provided path
     *
     * @public
     */
    getRepresentationAtPath<T>(path: string, bindingType: string): T | undefined {
        if (!this.isAttached()) {
            // Nice try
            throw new Error('Calling getRepresentationAtPath when not attached to a workspace');
        } else {
            const property = this.getPropertyTree()!.root.resolvePath(path);
            if (!property) {
                // Nice try
                throw new Error('Calling getRepresentationAtPath for a path that does not resolve to a property');
            }
            if (path.length && path[0] === '/') {
                path = path.substr(1);
            }
            return this._getRepresentationAtPathInternal(path, property, bindingType);
        }
    }

    /**
     * Internal function for getting the representation given the property and the path to the property.
     *
     * @param path - the path to the property.
     * @param property - the property for which we want the representation.
     * @param bindingType - the binding type we want the representation.
     *
     * @returns  the initialized runtime representation, or undefined if there is none registered
     *
     * @private
     * @hidden
     */
    _getRepresentationAtPathInternal(path: string, property: BaseProperty, bindingType: string): any | undefined {

        // Choose the best match for the type - we do it here because the representation might be stateless and in that
        // case we won't store it in the tree
        // TODO: Doesn't really work, or make sense for, types with multiple inheritance
        const bestRepresentationInfo = this._getAppropriateRepresentationInfo(property, bindingType);
        let result;
        if (bestRepresentationInfo && bestRepresentationInfo.stateless) {
            const key = path + bindingType + bestRepresentationInfo.typeID;
            const model = this._buildingStatelessRepresentations.get(key);
            if (model === _BUILDING_FLAG) {
                // We have a cycle
                // TODO: Report the conservative members of the cycle by listing all the runtime representation
                // entries tagged with '_BUILDING_FLAG'
                throw new Error('Cycle in the creation of the runtime representations');
            } else if (model) {
                result = model;
            } else {
                result = this._instantiateRepresentation([], property, bestRepresentationInfo, key);
            }
        } else {
            const tokenizedPath = PathHelper.tokenizePathString(path);
            const dataBindingTreeNode = this._dataBindingTree.getNodeForTokenizedPath(tokenizedPath);
            const value = (dataBindingTreeNode && dataBindingTreeNode.getValue()) ?
                dataBindingTreeNode.getValue() : undefined;
            const existingRepresentations = value ? value.representations : undefined;
            if (!existingRepresentations || !existingRepresentations.has(bindingType)) {
                if (bestRepresentationInfo) {
                    // We have a generator for creating such a representation!
                    result = this._instantiateRepresentation(tokenizedPath, property, bestRepresentationInfo);
                }
            } else {
                const entry = existingRepresentations.get(bindingType);
                if (entry === _BUILDING_FLAG) {
                    // We have a cycle
                    // TODO: Report the conservative members of the cycle by listing all the runtime representation entries tagged
                    // with '_BUILDING_FLAG'
                    throw new Error('Cycle in the creation of the runtime representations');
                }
                result = entry.representation;
            }
        }
        return result;
    }

    /**
     * Create an DataBinding tree node and an associated value for the given property, if not already there.
     *
     * @param in_property - the property for which we want to instantiate the associated node
     * @param in_tokenizedPath - the path to the property
     *
     * @returns The created node, guaranteed to also have a value
     *
     * @private
     * @hidden
     */
    _instantiateNodeAndValueForProperty(in_property: BaseProperty, in_tokenizedPath: Array<string>): NodeType {
        let dataBindingTreeNode = this._dataBindingTree.getNodeForTokenizedPath(in_tokenizedPath);
        if (!dataBindingTreeNode) {
            dataBindingTreeNode = this._dataBindingTree.insertChild(in_tokenizedPath, in_property.getContext());
        }
        let value = dataBindingTreeNode!.getValue();
        if (!value) {
            value = {};
            dataBindingTreeNode!.setValue(value);
        }

        return dataBindingTreeNode;
    }

    /**
     * Permits associating an existing runtime representation with a property.
     *
     * Typically, representations are created lazily when {@link DataBinder.getRepresentation} is called. This function
     * provides applications the ability to associate an existing runtime representation with a property/bindingType
     * pair.
     *
     * NOTE: The representation is expected to be of a type that is compatible with the maker/destroyers
     * specificed using {@link DataBinder.defineRepresentation}.
     * If the defined representation has a destroyer associated with it (see {@link DataBinder.defineRepresentation}),
     * then if this property is removed, the destroyer will be called on it.
     *
     * It is not permitted to associate a representation with a property/bindingType pair that already has
     * a representation associated with it. Users should be aware that if getRepresentation is done by
     * another subsystem for a property P, a representation will be lazily instantiated, and therefore
     * associateRepresentation for property P will fail.
     *
     * @param in_property - Property with which we want to associate a representation.
     * @param in_bindingType - binding type of the representation. This allows multiple representations
     *   to be associated with a single property.
     * @param in_representation - the representation to associate with this property.
     *
     * @throws If not attached to a workspace
     * @throws If the provided property is not part of the workspace attached to the DataBinder
     * @throws If the provided property/bindingType pair does not have a runtime representation defined for it.
     * @throws If the provided property/bindingType pair already has a representation associated with it
     * @throws If the provided property/bindingType pair has a stateless runtime representation defined for it.
     */
    associateRepresentation(in_property: BaseProperty, in_bindingType: string, in_representation: any) {
        if (!this.isAttached()) {
            // Nice try
            throw new Error('Calling associateRepresentation when not attached to a workspace');
        }
        if (in_property.getWorkspace() !== this.getPropertyTree()) {
            // Nice try
            throw new Error('Property that is not in the workspace attached to the DataBinder');
        }

        const representationInfo = this._getAppropriateRepresentationInfo(in_property, in_bindingType) as any;
        if (!representationInfo) {
            throw new Error('Calling associateRepresentation for a property/binding type that has no defined representation');
        }

        if (representationInfo.stateless) {
            throw new Error('Calling associateRepresentation for a property/binding type that has a stateless runtime representation defined for it');
        }

        const tokenizedPath = PathHelper.tokenizePathString(in_property.getAbsolutePath().substr(1));
        const dataBindingTreeNode = this._instantiateNodeAndValueForProperty(in_property, tokenizedPath)!;
        const value = dataBindingTreeNode.getValue();
        if (!value) {
            throw new Error('Probably a bug ? No binding node associated to this property.');
        }

        if (value.representations && value.representations.get(in_bindingType)) {
            throw new Error('Runtime representation already associated with the given property');
        }
        value.representations = value.representations || new Map();
        value.representations.set(in_bindingType, {
            representation: in_representation,
            representationInfo: representationInfo
        });
    }

    /**
     * Taking class hiearchy into account, find the most appropriate runtime representation to instantiate
     * for this property.
     *
     * @param in_property - the property for which we want to create the runtime representation
     * @param in_bindingType - the binding type we are interested in
     *
     * @returns he runtime data representation information
     *
     * @private
     * @hidden
     */
    _getAppropriateRepresentationInfo(in_property: BaseProperty, in_bindingType: string): any | undefined {
        const dataBinder = this;
        let bestRepresentationInfo;
        const byBindingType = dataBinder._representationGenerators.get(in_bindingType);
        if (byBindingType) {
            visitTypeHierarchy(in_property.getFullTypeid(), function(in_typeID) {
                const handle = byBindingType.best(in_typeID);
                if (handle) {
                    bestRepresentationInfo = handle.getUserData();
                    return false; // Abort type visiting
                }
                return true;
            });
        }
        return bestRepresentationInfo;
    }

    /**
     * Destroy the runtime representation, calling the user callback if necessary.
     *
     * @param in_representation - the runtime representation
     * @param in_representationInfo - the information about creating/destroying this runtime representation
     *
     * @private
     * @hidden
     */
    _destroyRepresentation(in_representation: any, in_representationInfo: any) {
        if (in_representationInfo.destroyerCallback) {
            in_representationInfo.destroyerCallback.call(
                null, in_representation, in_representationInfo.bindingType, in_representationInfo.userData
            );
        }
    }

    /**
     * Create the runtime representation for this property
     *
     * @param in_tokenizedPath - the tokenized path to this property
     * @param in_property - the property the runtime representation is associated with
     * @param in_representationInfo - the runtime representation information for building/destroying
     *   the representation
     * @param in_key - key to use for querying the currently building stateless representations map
     *
     * @returns The created runtime representation
     *
     * @private
     * @hidden
     */
    _instantiateRepresentation(in_tokenizedPath: Array<string>, in_property: BaseProperty, in_representationInfo: any, in_key?: string | undefined): object {
        // To detect cycles, we tag the runtime representation with _BUILDING_FLAG
        const bindingType = in_representationInfo.bindingType;
        const userData = in_representationInfo.userData;
        let value;
        if (in_representationInfo.stateless) {
            this._buildingStatelessRepresentations.set(in_key, _BUILDING_FLAG);
        } else {
            const dataBindingTreeNode = this._instantiateNodeAndValueForProperty(in_property, in_tokenizedPath)!;
            value = dataBindingTreeNode.getValue();
            const representations = value.representations || new Map();
            value.representations = representations;
            value.representations.set(bindingType, _BUILDING_FLAG);
        }

        let createdModel;
        try {
            createdModel = in_representationInfo.generatorCallback.call(null, in_property, bindingType, userData);
            // no throw, but no model returned?
            if (!createdModel) {
                throw new Error(`Error in creation of the runtime representation for ${bindingType}/${in_property.getFullTypeid()}.`);
            }
        } catch (error) {
            // clear the building flag, and rethrow
            if (in_representationInfo.stateless) {
                this._buildingStatelessRepresentations.delete(in_key);
            } else {
                value.representations.delete(bindingType);
            }
            throw error;
        }

        if (in_representationInfo.stateless) {
            // put the newly created representation into our 'currently building map' so that it's available during the
            // initializer callback
            this._buildingStatelessRepresentations.set(in_key, createdModel);
        } else {
            // We put the representation into the _dataBindingTree. This means if another runtime representation is dependent
            // on this one, during the initializer callback, it will be available
            value.representations.set(bindingType, {
                representation: createdModel,
                representationInfo: in_representationInfo
            });
        }
        if (in_representationInfo.initializerCallback) {
            in_representationInfo.initializerCallback.call(null, createdModel, in_property, bindingType, userData);
        }
        if (in_representationInfo.stateless) {
            // if it's stateless, we need to let go of our model
            this._buildingStatelessRepresentations.delete(in_key);
        }
        return createdModel;
    }

    /**
     * Convenience function for undefining all runtime representations associated with the given binding type. This will
     * cause any runtime representations that were generated to have their destroyer callbacks called.
     * Note; this will also invalidate any handles returned from {@link DataBinder.defineRepresentation}.
     *
     * @param in_bindingType - the binding type to undefine, if not provided, all representations will be
     *   undefined
     */
    undefineAllRepresentations(in_bindingType?: string) {
        const keys = in_bindingType ? [in_bindingType] : [...this._representationHandlesByBindingType.keys()];
        keys.forEach((in_currBindingType) => {
            const allByBindingType = this._representationHandlesByBindingType.get(in_currBindingType);
            if (allByBindingType) {
                // The 'destroy' will remove the handle from the allByBindingType list.
                while (allByBindingType.length) {
                    allByBindingType[allByBindingType.length - 1].destroy();
                }
            }
        });
    }

    /**
     * Return the unique id for the current/last changeset to be processed.
     * This id is guaranteed to change for every changeset that enters.
     *
     * @returns A unique changeset id, greater than or equal to zero.
     *
     * @hidden
     */
    getCurrentChangeSetId(): number {
        return this._currentChangeSetId;
    }

    /**
     * A unique key per running application; each instance of the databinder will have a different Id.
     *
     * @returns  The id of this DataBinder instance.
     * @public
     */
    getDataBinderId(): number {
        return this._dataBinderId;
    }

    /**
     * Reset internal debug counters (used for testing)
     * @hidden
     */
    public _resetDebugCounters() {
        this._dataBindingCreatedCounter = 0;
        this._dataBindingRemovedCounter = 0;
    }
}

