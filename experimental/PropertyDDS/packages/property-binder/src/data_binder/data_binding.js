/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Defines the base DataBinding that all DataBindings should inherit from.
 */
import { BaseProperty, PropertyFactory } from '@fluid-experimental/property-properties';
import { PathHelper, TypeIdHelper, ArrayChangeSetIterator, Utils } from '@fluid-experimental/property-changeset';

import _ from 'underscore';
import { ModificationContext } from './modification_context';
import { RemovalContext } from './removal_context';
import { getOrInsertDefaultInNestedObjects, getInNestedObjects } from '../external/utils/nested_object_helpers';
import {
  escapeTokenizedPathForMap, unescapeTokenizedStringForMap,
  initializeReferencePropertyTableNode, invokeCallbacks,
  deferCallback,
  isDataBindingRegistered,
  installForEachPrototypeMember,
  getOrCreateMemberOnPrototype,
  createHandle,
  invokeWithProperty,
  invokeWithCollectionProperty,
  createRegistrationFunction
} from './internal_utils';
import { concatTokenizedPath } from './data_binding_tree';
import { RESOLVE_NEVER, RESOLVE_ALWAYS, RESOLVE_NO_LEAFS } from '../internal/constants';
import { PropertyElement } from '../internal/property_element';

/**
 * _globalVisitIndex is to avoid callbacks being called twice. This works around bugs in getChangesToTokenizedPaths
 * which may visit properties with multiple nested changes several times (LYNXDEV-5365)
 * @hidden
 */
let _globalVisitIndex = 0;

/**
 * @hidden
 */
const validOptions = ['requireProperty', 'isDeferred'];

/**
 * The base class all data bindings should inherit from. using {@link DataBinder.defineDataBinding} and
 * {@link DataBinder.activateDataBinding}, the class can be instantiated for properties in the HFDM workspace
 * attached to the DataBinder.
 *
 * The DataBinding class is told of onPreModify, onModify, onPreRemove, onRemove etc. These can be overloaded
 * to get the expected behaviors.
 * In addition, {@link DataBinding.registerOnPath} can be used to register for more granular events regarding
 * insert, modify and delete for subpaths rooted at the associated property.
 *
 * @public
 * @alias DataBinding
 */
class DataBinding {
  /**
   * @param {object} in_params - An object containing the initialization parameters.
   * @param {external:BaseProperty} in_params.property - The HFDM property that this binding represents.
   * @param {DataBinder} in_params.dataBinder - The DataBinder that created this binding
   * @param {string} in_params.bindingType - The type of the binding.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
   * @param {Object} params.activationInfo - the information relating to the activation (userData, databinder...)
   *
   * @constructor
   * @package
   * @hideconstructor
   * @hidden
   */
  constructor(in_params) {
    this._property = in_params.property;
    this._referenceCount = 0;
    this._activationInfo = in_params.activationInfo;
    this._referencePropertyTable = {};
  }

  /**
   * Returns the userData associated with the data binding (if set). This userData value was provided when
   * the DataBinding was activated using {@link DataBinder.activateDataBinding}.
   *
   * @return {any|undefined} The userData, or undefined if it wasn't specified during activation.
   * @public
   */
  getUserData() {
    return this._activationInfo.userData;
  }

  /**
   * Increment the reference count for this databinding. Databindings can be activated from
   * multiple paths, however they will only be created once.
   *
   * @return {Number} the new reference count
   * @hidden
   */
  _incReferenceCount() {
    return ++this._referenceCount;
  }

  /**
   * Return the reference count on this databinding.
   *
   * @return {Number} the reference count
   * @hidden
   */
  _getReferenceCount() {
    return this._referenceCount;
  }

  /**
   * Decrement the reference count for this databinding. Databindings can be activated from
   * multiple paths, however they will only be created once.
   *
   * @return {Number} the new reference count
   * @hidden
   */
  _decReferenceCount() {
    return --this._referenceCount;
  }

  /**
   * Returns the HFDM property for which this DataBinding was instantiated.
   *
   * @return {BaseProperty} The corresponding HFDM property.
   * @public
   */
  getProperty() {
    return this._property;
  }

  /**
   * Returns a string that represents the binding type. This was specified when the DataBinding was
   * registered with the DataBinder using {@link DataBinder.activateDataBinding}.
   *
   * @return {string} The binding type of this DataBinding.
   * @public
   */
  getDataBindingType() {
    return this._activationInfo.bindingType;
  }

  /**
   * Returns the DataBinder instance associated with this DataBinding.
   *
   * @return {DataBinder} The DataBinder instance.
   * @public
   */
  getDataBinder() {
    return this._activationInfo.dataBinder;
  }

  /**
   * Returns the Property Element at the tokenized path supplied. The path is assumed to be absolute, or relative
   * from the Property corresponding to this DataBinding. If the Property is already deleted it returns
   * undefined.
   *
   * @param {Array.<String>} in_tokenizedPath - the tokenized sub-path / absolute path
   * @param {Boolean=} in_resolveReference - default true; if true, resolve the leaf reference if applicable
   * @return {BaseProperty|undefined} the property at the sub-path (or undefined).
   * @package
   * @hidden
   */
  getPropertyElementForTokenizedPath(in_tokenizedPath, in_resolveReference) {
    const element = new PropertyElement(this._property);
    if (element.isValid()) {
      element.becomeChild(in_tokenizedPath, in_resolveReference === false ? RESOLVE_NO_LEAFS : RESOLVE_ALWAYS);
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
   * @param {ModificationContext} in_modificationContext - A context object describing the modification.
   * @protected
   */
  onPostCreate(in_modificationContext) {
    console.warn('Calling base class onPostCreate is deprecated; the call is no longer needed');
  }

  /**
   * @param {ModificationContext} in_modificationContext - The modifications
   * @private
   * @hidden
   */
  _onPostCreate(in_modificationContext) {
  }

  /**
   * @param {ModificationContext} in_modificationContext - The modifications
   * @private
   * @hidden
   */
  _invokeInsertCallbacks(in_modificationContext) {
    if (this._registeredPaths) {
      if (!in_modificationContext.isSimulated()) {
        this._forEachPrototypeMember('_registeredPaths', in_registeredPaths => {
          this._handleModifications(
            in_modificationContext, in_registeredPaths,
            this._referencePropertyTable, false /* called for reference */,
            this._property, undefined, 0, undefined, []
          );
        });
      } else {
        // We got a (forced) insert event, so we should call all registered insert handlers
        this._forEachPrototypeMember('_registeredPaths', in_registeredPaths => {
          this._invokeInsertCallbacksForPaths(
            [], in_registeredPaths, this._property, true, true
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
   * @param {ModificationContext} in_modificationContext - A context object describing the modification.
   * @protected
   */
  onPreModify(in_modificationContext) {
    console.warn('Calling base class onPreModify is deprecated; the call is no longer needed');
  }

  /**
   * @param {ModificationContext} in_modificationContext - The modifications
   * @private
   * @hidden
   */
  _onPreModify(in_modificationContext) {
  }

  /**
   * Handler that is called when this data binding's corresponding property or any of its child properties are modified.
   * This function will be called after all of the children's onPreModify and onModify handlers.
   *
   * The base class implementation should _not_ be called by inheriting classes.
   *
   * @param {ModificationContext} in_modificationContext - A context object describing the modification.
   * @protected
   */
  onModify(in_modificationContext) {
    console.warn('Calling base class onModify is deprecated; the call is no longer needed');
  }

  /**
   * @param {ModificationContext} in_modificationContext - The modifications
   * @private
   * @hidden
   */
  _onModify(in_modificationContext) {
  }

  /**
   * @param {ModificationContext} in_modificationContext - The modifications
   * @private
   * @hidden
   */
  _invokeModifyCallbacks(in_modificationContext) {
    if (this._registeredPaths) {
      this._forEachPrototypeMember('_registeredPaths', in_registeredPaths => {
        this._handleModifications(
          in_modificationContext, in_registeredPaths,
          this._referencePropertyTable, false /* called for reference */,
          this._property, undefined, 0, undefined, []
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
   * @param {RemovalContext} in_removalContext - A context object describing the removal event.
   * @protected
   */
  onPreRemove(in_removalContext) {
    console.warn('Calling base class onPreRemove is deprecated; the call is no longer needed');
  }

  /**
   * @param {RemovalContext} in_removalContext - The removal context
   * @private
   * @hidden
   */
  _onPreRemove(in_removalContext) {
    delete this._property; // HFDM already deleted this, so we don't want dangling refs here
  }

  /**
   * @param {string[]} in_tokenizedAbsolutePath - starting absolute path
   * @param {boolean} in_simulated - are we pretending something is being removed, or is it for realz?
   * @private
   * @hidden
   */
  _invokeRemoveCallbacks(in_tokenizedAbsolutePath, in_simulated) {
    if (this._registeredPaths) {
      this._forEachPrototypeMember('_registeredPaths', in_registeredPaths => {
        this._handleRemovals(
          in_tokenizedAbsolutePath,
          in_registeredPaths,
          this._referencePropertyTable,
          0, {
            simulated: in_simulated,
            calledForReferenceTargetChanged: false,
            removeRootCallbacks: true,
            callRootRemovals: false,
            callRemovals: true
          }
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
   * @param {RemovalContext} in_removalContext - A context object describing the removal event.
   * @protected
   */
  onRemove(in_removalContext) {
    console.warn('Calling base class onRemove is deprecated; the call is no longer needed');
  }

  /**
   * @param {RemovalContext} in_removalContext - The removal context
   * @private
   * @hidden
   */
  _onRemove(in_removalContext) {
  }

  /**
   * Registers callbacks for all reference properties below the given root property for
   * which a registered path exists
   *
   * @param {external:BaseProperty} in_rootProperty       - The root property where the registration starts
   * @param {Object}                     in_registeredSubPaths - The paths for which the user has registered handlers
   *                                                             (this structure has to start at the same root as
   *                                                             in_rootProperty)
   * @param {Array.<String>} in_tokenizedFullPath -
   *     The full path from the DataBinding to this reference (including resolved previous references)
   * @param {Array.<String>}             in_registrySubPath    - Path from the root of the reference registry to the
   *                                                             current node
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that starts at the same root as in_registrySubPath
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of the
   *     the in_referencePropertySubTable
   * @param {Object} in_previousSourceReferencePropertyInfo -
   *     This contains the reference property table entry for the referencing property. It's used to validate whether
   *     the currently followed reference chain is still valid.
   * @param {Boolean} [in_retroactiveRegister] - if false (the default), disable the just-created handler until the end
   *     of processing of the current ChangeSet. When registering retroactively, there is no changeset, and the handler
   *     should be invoked immediately.
   * @private
   * @hidden
   */
  _registerCallbacksForReferenceProperties(
    in_rootProperty,
    in_registeredSubPaths,
    in_tokenizedFullPath,
    in_registrySubPath,
    in_referencePropertySubTable,
    in_indirectionsAtRoot,
    in_previousSourceReferencePropertyInfo,
    in_retroactiveRegister
  ) {
    if (PropertyFactory.instanceOf(in_rootProperty, 'Reference', 'single')) {
      this._registerCallbacksForSingleReferenceProperty(
        in_registrySubPath,
        in_tokenizedFullPath,
        in_registeredSubPaths,
        in_referencePropertySubTable,
        in_indirectionsAtRoot,
        in_rootProperty,
        in_previousSourceReferencePropertyInfo,
        in_retroactiveRegister,
        undefined);
    } else if (PropertyFactory.instanceOf(in_rootProperty, 'Reference', 'map') ||
      PropertyFactory.instanceOf(in_rootProperty, 'Reference', 'array')) {
      throw new Error('Not yet implemented');
    } else {
      // Recursively register for sub-paths
      var registeredKeys = _.keys(in_registeredSubPaths);
      for (var i = 0; i < registeredKeys.length; i++) {
        // Get the key
        var key = registeredKeys[i];
        if (key === '__registeredDataBindingHandlers') {
          continue;
        }

        // Get the corresponding property object - we only go one level deeper so can use NEVER here
        var subProperty = in_rootProperty.get(unescapeTokenizedStringForMap(key), RESOLVE_NEVER);
        if (!subProperty) {
          continue;
        }

        // Recursively traverse
        in_registrySubPath.push(key);
        this._registerCallbacksForReferenceProperties(subProperty,
          in_registeredSubPaths[key],
          in_tokenizedFullPath,
          in_registrySubPath,
          in_referencePropertySubTable,
          0,
          in_previousSourceReferencePropertyInfo,
          in_retroactiveRegister);
        in_registrySubPath.pop();
      }
    }
  }

  /**
   * helper function to work around a bug LYNXDEV-7507 in HFDM
   *
   * @param {BaseProperty} in_property - the property to dereference
   * @return {BaseProperty|undefined} the property at the end of the references, or undefined if there
   * is none
   *
   * @hidden
   */
  _dereferenceProperty(in_property) {
    while (in_property && TypeIdHelper.isReferenceTypeId(in_property.getTypeid())) {
      in_property = in_property.get(undefined, RESOLVE_ALWAYS);
    }
    return in_property;
  }

  /**
   * Registers the callbacks for a specific reference property. If the reference property exists and represents
   * a valid reference, it will bind against the references in the referenced property for which handlers have
   * been registered in the _registeredPaths.
   *
   * @param {Object} in_tokenizedRegistrySubPath -
   *     The path in the handler registry for which the reference callbacks are added
   * @param {Array.<String>} in_tokenizedFullPath -
   *     The full path from the data binding to this reference (including resolved previous references)
   * @param {Object} in_registeredSubPaths -
   *     The paths for which the user has registered handlers
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that starts at the same root as in_tokenizedRegistrySubPath
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of the
   *     the in_referencePropertySubTable
   * @param {external:BaseProperty} in_referenceProperty -
   *     The property that contains the reference that resulted in this callback.
   * @param {Object} in_previousSourceReferencePropertyInfo -
   *     This contains the reference property table entry for the referencing property. It's used to validate whether
   *     the currently followed reference chain is still valid.
   * @param {Boolean} [in_retroactiveRegister] - if false (the default), disable the just-created handler until the end
   *     of processing of the current ChangeSet. When registering retroactively, there is no changeset, and the handler
   *     should be invoked immediately.
   * @param {string} [in_referenceKey] - if provided, in_referenceProperty is assumed to be an array/map of references
   *     and this parameter is used as key to identify the exact reference.
   * @private
   * @hidden
   */
  _registerCallbacksForSingleReferenceProperty(
    in_tokenizedRegistrySubPath,
    in_tokenizedFullPath,
    in_registeredSubPaths,
    in_referencePropertySubTable,
    in_indirectionsAtRoot,
    in_referenceProperty,
    in_previousSourceReferencePropertyInfo,
    in_retroactiveRegister,
    in_referenceKey
  ) {
    let originalReferencedPath;
    const pathToReferenceProperty = in_referenceProperty.getAbsolutePath();
    in_retroactiveRegister = !!in_retroactiveRegister; // default is false!

    // Check in the data-structure, whether there are any registered reference modification callbacks
    // in the path-subtree below the modified reference
    let tokenizedRegistrySubPath;
    var registeredSubPaths = in_registeredSubPaths;

    const referencedElement = new PropertyElement(in_referenceProperty);
    if (in_referenceKey !== undefined) {
      if (registeredSubPaths[in_referenceKey] !== undefined) {
        registeredSubPaths = registeredSubPaths[in_referenceKey];
      }
      tokenizedRegistrySubPath = in_tokenizedRegistrySubPath.concat(in_referenceKey);
      originalReferencedPath = in_referenceProperty.getValue(in_referenceKey);
      referencedElement.becomeChild(in_referenceKey, RESOLVE_NO_LEAFS);
    } else {
      tokenizedRegistrySubPath = in_tokenizedRegistrySubPath;
      originalReferencedPath = in_referenceProperty.getValue();
    }

    // Dereference the reference one hop. Note, the result may be an element of a primitive array!
    referencedElement.becomeDereference(RESOLVE_NO_LEAFS);

    // Compute the final target of the reference, if it exists, in case there are multiple hops.
    let targetElement;
    if (referencedElement.isValid() && referencedElement.isReference()) {
      // We know referencedProperty resolves at least one hop, but we need to validate that the reference
      // eventually gets to a real property --- there may be a break in the chain of references.
      targetElement = referencedElement.getDereference();
    } else {
      targetElement = referencedElement;
    }
    const targetAbsolutePath = targetElement.isValid() ? targetElement.getAbsolutePath() : undefined;

    var handlerNode = getInNestedObjects.apply(this, [in_referencePropertySubTable].concat(
      escapeTokenizedPathForMap(tokenizedRegistrySubPath)));

    if (handlerNode) {
      // Recursively remove all old handlers from the DataBinding tree
      // TODO: handle the case when we have a reference collection with overlapping registeredSubPaths
      const tokenized = PathHelper.tokenizePathString(pathToReferenceProperty);
      tokenized.shift(); // Remove the '/'

      // We fire removals/referenceRemovals _only_ if the path became invalid or changed
      const fireRemovals = handlerNode.__registeredData.lastTargetPropAbsPath !== undefined &&
        handlerNode.__registeredData.lastTargetPropAbsPath !== targetAbsolutePath;
      // This will remove existing handlers (_referenceTargetChanged bindings, done below)
      // and simultaneously fire remove/referenceRemoves if fireRemovals.
      this._handleRemovals(
        tokenized,
        registeredSubPaths,
        handlerNode,
        in_indirectionsAtRoot, {
          simulated: false,
          calledForReferenceTargetChanged: true,
          removeRootCallbacks: true,
          callRootRemovals: true,
          callRemovals: fireRemovals
        }
      );
    }

    // Insert the handler into the reference property handler data-structure
    if (!handlerNode) {
      handlerNode = getOrInsertDefaultInNestedObjects.apply(this,
        [in_referencePropertySubTable].concat(escapeTokenizedPathForMap(tokenizedRegistrySubPath)).concat({}));
    }
    initializeReferencePropertyTableNode(handlerNode);

    if (_.isString(originalReferencedPath) && originalReferencedPath !== '') {
      // The original reference was not empty.
      // Compute the final reference path, after taking relative paths into account.
      let finalReferencedPath;
      if (originalReferencedPath[0] === '/') {
        // We are referencing an absolute property - optimize this case.
        finalReferencedPath = originalReferencedPath.substr(1);
      } else {
        // The eventual referencedElement may be invalid (it may not exist yet, but we still need to bind to
        // notice when it appears (if it does)).
        // So we need to figure out the absolute path from where our
        // reference property is (taking ".." tokens into account).
        var referencedPathTokenTypes = [];
        var tokenizedReferencedPath = PathHelper.tokenizePathString(originalReferencedPath, referencedPathTokenTypes);
        var numberOfRaiseLevelTokens = 0;
        var ti;
        for (ti = 0; ti < referencedPathTokenTypes.length &&
          referencedPathTokenTypes[ti] === PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN; ++ti) {
          numberOfRaiseLevelTokens++;
        }
        for (ti = 0; ti < numberOfRaiseLevelTokens; ++ti) {
          tokenizedReferencedPath.shift();
          referencedPathTokenTypes.shift();
        }
        var absolutePathTokenTypes = [];
        console.assert(in_referenceProperty);
        // the path to which the referenced path is relative to is actually the _parent_ of the referenceProperty!
        var absolutePath = in_referenceProperty.getParent().getAbsolutePath().substr(1);
        var tokenizedAbsolutePath = PathHelper.tokenizePathString(absolutePath, absolutePathTokenTypes);
        // cut off from the end of the absolute path the levels that we traversed upwards
        console.assert(tokenizedAbsolutePath.length >= numberOfRaiseLevelTokens);
        tokenizedAbsolutePath.length = tokenizedAbsolutePath.length - numberOfRaiseLevelTokens;
        absolutePathTokenTypes.length = absolutePathTokenTypes.length - numberOfRaiseLevelTokens;
        // concatenate the remainder of the absolute path with the relative path stripped of '..' tokens
        tokenizedReferencedPath = tokenizedAbsolutePath.concat(tokenizedReferencedPath);
        referencedPathTokenTypes = absolutePathTokenTypes.concat(referencedPathTokenTypes);
        finalReferencedPath = concatTokenizedPath(tokenizedReferencedPath, referencedPathTokenTypes,
          tokenizedReferencedPath.length);
      }

      var typeidHolder = {
        typeid: undefined
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
        in_registeredSubPaths, // Note, the original version, not registeredSubPaths
        in_referencePropertySubTable,
        '/' + finalReferencedPath,
        typeidHolder,
        in_indirectionsAtRoot,
        in_previousSourceReferencePropertyInfo,
        in_tokenizedFullPath.slice(),
        tokenizedRegistrySubPath.slice(),
        in_referenceKey
      );
      const handle = this.getDataBinder()._registerOnSimplePath(
        finalReferencedPath,
        ['insert', 'modify', 'remove'],
        modificationCallback
      );
      console.assert(handlerNode.__registeredData.handlers.length === in_indirectionsAtRoot);
      handlerNode.__registeredData.handlers.push(handle);

      // We store a @#$@# of data with the handler. This should be cut down. We store this information so that
      // if the target changes, we can evaluate what changed.
      var sourceReferencePropertyInfo = handlerNode.__registeredData.sourceReferencePropertyInfo;
      sourceReferencePropertyInfo[in_indirectionsAtRoot] = sourceReferencePropertyInfo[in_indirectionsAtRoot] || {};
      sourceReferencePropertyInfo[in_indirectionsAtRoot].property = in_referenceProperty;
      sourceReferencePropertyInfo[in_indirectionsAtRoot].propertyPath = pathToReferenceProperty;
      sourceReferencePropertyInfo[in_indirectionsAtRoot].propertyKey = in_referenceKey;
      sourceReferencePropertyInfo[in_indirectionsAtRoot].referencedPath = originalReferencedPath;
      sourceReferencePropertyInfo[in_indirectionsAtRoot].previousInfo = in_previousSourceReferencePropertyInfo;

      if (!in_retroactiveRegister) {
        // We create the handler in a disabled state, since after a change of a reference,
        // we don't yet want to get events for the referenced properties. Only after processing this scope has
        // finished, the handler is re-enabled and thus events on the referenced properties are processed.
        sourceReferencePropertyInfo[in_indirectionsAtRoot].disabled = true;
        this.getDataBinder().requestChangesetPostProcessing(function() {
          this.disabled = false;
        }, sourceReferencePropertyInfo[in_indirectionsAtRoot]);
      } else {
        // we are retroactively handling a binding and there is no ChangeSet, so we immediately enable the handler
        sourceReferencePropertyInfo[in_indirectionsAtRoot].disabled = false;
      }

      // here, if there was previously no target, lastTargetPropAbsPath is undefined.
      if (targetAbsolutePath !== handlerNode.__registeredData.lastTargetPropAbsPath) {
        // We are targetting a new property --- send insert notifications
        handlerNode.__registeredData.lastTargetPropAbsPath = targetAbsolutePath;
        const pathRelativeToBaseBinding = in_tokenizedFullPath.concat(tokenizedRegistrySubPath);
        this._invokeInsertCallbacksForPaths(
          pathRelativeToBaseBinding, registeredSubPaths, targetElement.getProperty(), in_retroactiveRegister, false
        );
      }

      // TODO: handle referencedElement being a collection of primitive elements.
      if (referencedElement.isValid() && !referencedElement.isPrimitiveCollectionElement()) {
        typeidHolder.typeid = referencedElement.getTypeId();

        this._registerCallbacksForReferenceProperties(
          referencedElement.getProperty(),
          registeredSubPaths,
          in_tokenizedFullPath,
          tokenizedRegistrySubPath,
          in_referencePropertySubTable,
          in_indirectionsAtRoot + 1,
          sourceReferencePropertyInfo[in_indirectionsAtRoot],
          in_retroactiveRegister
        );
      }
    }
  }

  /**
   * Callback that is invoked, if a reference has been changed
   *
   * @param {Object} in_registeredSubPaths -
   *     The paths for which the user has registered handlers (this structure has to be rooted at the
   *     modified reference)
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that is rooted at the modified reference
   * @param {string} in_rootPath - The path to which this handler is bound
   * @param {Object} in_rootTypeidHolder -
   *     Object holding the full typeid of the Property at the root of the currently processed ChangeSet
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of the
   *     the in_referencePropertySubTable
   * @param {Object} in_previousSourceReferencePropertyInfo -
   *     This contains the reference property table entry for the referencing property. It's used to validate whether
   *     the currently followed reference chain is still valid.
   * @param {Array.<String>} in_tokenizedFullPath -
   *     The full path from the data binding to this reference (including resolved previous references)
   * @param {string[]} in_tokenizedRegistrySubPath -
   * @param {string} [in_referenceKey] - if provided, in_referenceProperty is assumed to be an array/map of references
   *     and this parameter is used as key to identify the exact reference.
   * @param {ModificationContext|RemovalContext} in_modificationContext -
   *     The modifications / removal information for the reference
   * @private
   * @hidden
   */
  _referenceTargetChanged(
    in_registeredSubPaths,
    in_referencePropertySubTable,
    in_rootPath,
    in_rootTypeidHolder,
    in_indirectionsAtRoot,
    in_previousSourceReferencePropertyInfo,
    in_tokenizedFullPath,
    in_tokenizedRegistrySubPath,
    in_referenceKey,
    in_modificationContext
  ) {
    const handlerNode = getOrInsertDefaultInNestedObjects.apply(this,
      [in_referencePropertySubTable].concat(escapeTokenizedPathForMap(in_tokenizedRegistrySubPath)).concat({}));

    if (handlerNode.__registeredData.sourceReferencePropertyInfo) {
      var sourceReferencePropertyInfo =
        handlerNode.__registeredData.sourceReferencePropertyInfo[in_indirectionsAtRoot];

      while (sourceReferencePropertyInfo !== undefined) {
        var referencedPath = sourceReferencePropertyInfo.propertyKey !== undefined ?
          sourceReferencePropertyInfo.property.getValue(sourceReferencePropertyInfo.propertyKey) :
          sourceReferencePropertyInfo.property.getValue();
        if (sourceReferencePropertyInfo.property.getAbsolutePath() !==
          sourceReferencePropertyInfo.propertyPath ||
          referencedPath !==
          sourceReferencePropertyInfo.referencedPath ||
          sourceReferencePropertyInfo.disabled) {
          return;
        }
        sourceReferencePropertyInfo = sourceReferencePropertyInfo.previousInfo;
      }
    }
    var registeredSubPaths = in_registeredSubPaths;
    if (in_referenceKey !== undefined && registeredSubPaths[in_referenceKey] !== undefined) {
      registeredSubPaths = registeredSubPaths[in_referenceKey];
    }

    // Recursively invoke the path handlers for the referenced property
    if (in_modificationContext instanceof ModificationContext) {
      // TODO: will we always have a property here even for references that point to not-yet-existing paths?
      if (in_modificationContext.getOperationType() === 'insert') {
        // The property we point to finally exists.
        // If this code looks familiar, it is because it is a version of the end of
        // _registerCallbacksForSingleReferenceProperty.
        const targetProp = this._property.getRoot().resolvePath(in_rootPath, RESOLVE_NEVER);
        const eventualProp = this._dereferenceProperty(targetProp);

        in_rootTypeidHolder.typeid = targetProp.getFullTypeid();

        if (eventualProp) {
          handlerNode.__registeredData.lastTargetPropAbsPath = eventualProp.getAbsolutePath();
        }

        const pathRelativeToBaseBinding = in_tokenizedFullPath.concat(in_tokenizedRegistrySubPath);
        this._invokeInsertCallbacksForPaths(pathRelativeToBaseBinding, registeredSubPaths, targetProp, false, false);
        this._registerCallbacksForReferenceProperties(
          targetProp,
          registeredSubPaths,
          in_tokenizedFullPath,
          in_tokenizedRegistrySubPath,
          in_referencePropertySubTable,
          in_indirectionsAtRoot + 1,
          handlerNode.__registeredData.sourceReferencePropertyInfo[in_indirectionsAtRoot],
          false
        );
      } else {
        this._handleModifications(in_modificationContext, registeredSubPaths,
          handlerNode, true /* called for reference target changed */, in_rootPath,
          in_rootTypeidHolder, in_indirectionsAtRoot,
          in_previousSourceReferencePropertyInfo,
          in_tokenizedFullPath.concat(in_tokenizedRegistrySubPath),
        );
      }
    } else {
      // then it is a removalContext
      const removalContext = in_modificationContext;
      const tokenizedAbsolutePath = PathHelper.tokenizePathString(removalContext.getAbsolutePath());
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
        in_indirectionsAtRoot, {
          simulated: false,
          calledForReferenceTargetChanged: true,
          // don't remove any handlers on the root - we will still want to be notified if it gets added again
          removeRootCallbacks: false,
          callRootRemovals: true,
          callRemovals: true
        }
      );
    }
  }

  /**
   * This function will handle additional bookkeeping necessary when encountering a reference Property during
   * handling modifications.
   *
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
   * @param {Object} in_previousSourceReferencePropertyInfo -
   *     This contains the reference property table entry for the referencing property. It's used to validate whether
   *     the currently followed reference chain is still valid.
   * @param {TraversalContext} in_context - Traversal context
   * @param {Object} in_nestedRegisteredPath -
   *     The paths for which the user has registered handlers (this structure has to be rooted at the
   *     same property as the modification context)
   * @param {Array.<String>} in_tokenizedPath - The (relative) path from the data binding
   *     to the current traversal position (including resolved previous references)
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that is rooted at the same property as the modification context
   * @param {Boolean} in_calledForReferenceTargetChanged -
   *     This handler was called due to the target of a reference changing
   * @param {external:BaseProperty|String} in_rootPathOrProperty -
   *     Either the property at which the changeSet processed by this function is rooted, or alternatively
   *     a path to this property. This will be used to resolve other paths.
   * @param {Array.<String>} in_tokenizedFullPath -
   *     The full path from the data binding to the current position (including resolved previous references)
   * @private
   * @hidden
   */
  _handleReferenceModifications(
    in_indirectionsAtRoot,
    in_previousSourceReferencePropertyInfo,
    in_context,
    in_nestedRegisteredPath,
    in_tokenizedPath,
    in_referencePropertySubTable,
    in_calledForReferenceTargetChanged,
    in_rootPathOrProperty,
    in_tokenizedFullPath
  ) {
    var level = in_tokenizedPath.length === 0 ? in_indirectionsAtRoot + 1 : 0;
    var that = this;
    var operationType = in_context.getOperationType();

    if (operationType === 'insert' || operationType === 'modify') {
      var rootProperty = in_rootPathOrProperty;
      if (_.isString(in_rootPathOrProperty)) {
        rootProperty = this._property.resolvePath(in_rootPathOrProperty, RESOLVE_NO_LEAFS);
      }
      var collectionKeys, currentKey, k;
      var referenceProperty = rootProperty.get(in_tokenizedPath, RESOLVE_NO_LEAFS);
      var nestedChangeSet = in_context.getNestedChangeSet();
      var referenceInformation, nestedRegisteredPath;
      const tokenizedAbsolutePath = PathHelper.tokenizePathString(
        referenceProperty.getAbsolutePath()
      );
      tokenizedAbsolutePath.shift(); // Remove the '/'

      if (in_context.getSplitTypeID().context === 'single') {
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
          undefined);
      } else if (in_context.getSplitTypeID().context === 'map') {
        var processNestedChangeSet = function(in_nestedChangeSet) {
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
              currentKey
            );
          }
        };
        var processNestedChangeSetRemove = function(in_nestedChangeSet) {
          // reference types are always primitive types so our loop can be simpler
          for (k = 0; k < in_nestedChangeSet.length; k++) {
            currentKey = in_nestedChangeSet[k];
            referenceInformation = getInNestedObjects.apply(undefined, [in_referencePropertySubTable].concat(
              escapeTokenizedPathForMap(in_tokenizedPath.concat(currentKey))));
            // we only need to call _handleRemovals if we actually had a reference there (we might have deleted
            // an "empty" reference from the map in which case we don't need to do anything
            if (referenceInformation) {
              nestedRegisteredPath = in_nestedRegisteredPath[currentKey] ? in_nestedRegisteredPath[currentKey] :
                in_nestedRegisteredPath;
              tokenizedAbsolutePath.push(currentKey);
              that._handleRemovals(
                tokenizedAbsolutePath,
                nestedRegisteredPath,
                referenceInformation,
                level, {
                  simulated: false,
                  calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
                  removeRootCallbacks: true,
                  callRootRemovals: false,
                  callRemovals: true
                }
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
      } else if (in_context.getSplitTypeID().context === 'array') {
        var arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
        var index, i;
        while (!arrayIterator.atEnd()) {
          switch (arrayIterator.type) {
          case ArrayChangeSetIterator.types.INSERT:
          case ArrayChangeSetIterator.types.MODIFY:
            for (i = 0; i < arrayIterator.operation[1].length; ++i) {
              index = arrayIterator.operation[0] + i + arrayIterator.offset;
              this._registerCallbacksForSingleReferenceProperty(
                in_tokenizedPath,
                in_tokenizedFullPath,
                in_nestedRegisteredPath,
                in_referencePropertySubTable,
                level,
                referenceProperty,
                in_previousSourceReferencePropertyInfo,
                false, // not registering retroactively
                index
              );
            }
            break;
          case ArrayChangeSetIterator.types.REMOVE:
            for (i = 0; i < arrayIterator.operation[1]; ++i) {
              // We don't have a changeset for this. Since we assume that the previous elements have already
              // been removed, we don't add the range index i in this call
              // Provide context (even w/o a valid changeset) to make writing callbacks easier
              index = arrayIterator.operation[0] + arrayIterator.offset;
              referenceInformation = getInNestedObjects.apply(undefined, [in_referencePropertySubTable].concat(
                escapeTokenizedPathForMap(in_tokenizedPath.concat(index))));
              // we only need to call _handleRemovals if we actually had a reference there (we might have deleted
              // an "empty" reference from the array in which case we don't need to do anything
              if (referenceInformation) {
                nestedRegisteredPath = in_nestedRegisteredPath[index] ? in_nestedRegisteredPath[index] :
                  in_nestedRegisteredPath;
                tokenizedAbsolutePath.push(arrayIterator.offset);
                this._handleRemovals(
                  tokenizedAbsolutePath,
                  nestedRegisteredPath,
                  referenceInformation,
                  level, {
                    simulated: false,
                    calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
                    removeRootCallbacks: true,
                    callRootRemovals: false,
                    callRemovals: true
                  }
                );
                tokenizedAbsolutePath.pop();
              }
            }
            break;
          default:
            throw new Error('ArrayChangeSetIterator: unknown operator ' + arrayIterator.type);
          }
          arrayIterator.next();
        }
      } else {
        throw new Error('unknown reference context: ' + in_context.getSplitTypeID().context);
      }
    } else {
      // Otherwise the removal of a reference
      referenceInformation = getInNestedObjects.apply(undefined, [in_referencePropertySubTable].concat(
        escapeTokenizedPathForMap(in_tokenizedPath)));
      if (referenceInformation) {
        this._handleRemovals(
          in_tokenizedFullPath,
          in_nestedRegisteredPath,
          referenceInformation,
          level, {
            simulated: false,
            calledForReferenceTargetChanged: in_calledForReferenceTargetChanged,
            removeRootCallbacks: true,
            callRootRemovals: false,
            callRemovals: true
          }
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
   * @param {ModificationContext} in_modificationContext -
   *     The modifications
   * @param {Object} in_registeredSubPaths -
   *     The paths for which the user has registered handlers (this structure has to be rooted at the
   *     same property as the modification context)
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that is rooted at the same property as the modification context
   * @param {Boolean} in_calledForReferenceTargetChanged -
   *     This handler was called due to the target of a reference changing
   * @param {external:BaseProperty|String} in_rootPathOrProperty -
   *     Either the property at which the changeSet processed by this function is rooted, or alternatively
   *     a path to this property. This will be used to resolve other paths.
   * @param {Object} in_referencedPropertyTypeidHolder -
   *     Object containing full typeid of the referenced object (including context).
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
   * @param {Object} in_previousSourceReferencePropertyInfo -
   *     This contains the reference property table entry for the referencing property. It's used to validate whether
   *     the currently followed reference chain is still valid.
   * @param {Array.<String>} in_tokenizedFullPath -
   *     The full path from the Data Binding to the current position (including resolved previous references)
   * @private
   * @hidden
   */
  _handleModifications(
    in_modificationContext,
    in_registeredSubPaths,
    in_referencePropertySubTable,
    in_calledForReferenceTargetChanged,
    in_rootPathOrProperty,
    in_referencedPropertyTypeidHolder,
    in_indirectionsAtRoot,
    in_previousSourceReferencePropertyInfo,
    in_tokenizedFullPath
  ) {
    var rootTypeid = in_referencedPropertyTypeidHolder ? in_referencedPropertyTypeidHolder.typeid :
      in_rootPathOrProperty.getFullTypeid();

    // _globalVisitIndex is to avoid callbacks being called twice. This works around bugs in getChangesToTokenizedPaths
    // which may visit properties with multiple nested changes several times (LYNXDEV-5365)
    const tokenizedPathCallback = invokeCallbacks.bind(
      undefined,
      this,
      in_modificationContext,
      in_calledForReferenceTargetChanged,
      in_tokenizedFullPath,
      ++_globalVisitIndex
    );
    Utils.getChangesToTokenizedPaths(in_registeredSubPaths,
      in_modificationContext.getNestedChangeSet(),
      function(in_context, in_currentSubPaths, in_currentTokenizedPath, in_contractedSegment) {
        const operationType = in_context.getOperationType();
        if (operationType !== 'remove') {
          const isReference = TypeIdHelper.isReferenceTypeId(in_context.getSplitTypeID().typeid);
          if (isReference && !in_contractedSegment) {
            this._handleReferenceModifications(in_indirectionsAtRoot,
              in_previousSourceReferencePropertyInfo,
              in_context,
              in_currentSubPaths,
              in_currentTokenizedPath,
              in_referencePropertySubTable,
              in_calledForReferenceTargetChanged,
              in_rootPathOrProperty,
              in_tokenizedFullPath);
          }
          tokenizedPathCallback(in_context, in_currentSubPaths.__registeredDataBindingHandlers,
            in_currentTokenizedPath, isReference);
        } else {
          // getChangesToTokenizedPaths recursion stops here -- finish the recursion for 'remove'
          // Check, whether we have registered a reference processing handler for this path
          // In that case it is a reference.
          const that = this;
          const visitor = function(in_subpathEntry, in_referenceEntry, in_tokenizedPath) {
            const isReference = in_referenceEntry &&
              in_referenceEntry.__registeredData &&
              in_referenceEntry.__registeredData.handlers;
            if (isReference) {
              that._handleReferenceModifications(in_indirectionsAtRoot,
                in_previousSourceReferencePropertyInfo,
                in_context,
                in_subpathEntry,
                in_tokenizedPath,
                in_referencePropertySubTable,
                in_calledForReferenceTargetChanged,
                in_rootPathOrProperty,
                in_tokenizedFullPath
              );
            }
            if (in_subpathEntry.__registeredDataBindingHandlers) {
              tokenizedPathCallback(in_context, in_subpathEntry.__registeredDataBindingHandlers,
                in_tokenizedPath, isReference
              );
            }
            // Recurse if it is not a reference. References are handled _referenceTargetChanged
            if (!isReference) {
              _.each(in_subpathEntry, function(in_child, in_childName) {
                if (in_childName !== '__registeredDataBindingHandlers') {
                  in_tokenizedPath.push(in_childName);
                  visitor(in_child, in_referenceEntry ? in_referenceEntry[in_childName] : undefined, in_tokenizedPath);
                  in_tokenizedPath.pop();
                }
              });
            }
          };
          const startingRefEntry = getInNestedObjects.apply(this, [in_referencePropertySubTable].concat(
            escapeTokenizedPathForMap(in_currentTokenizedPath)));
          visitor(in_currentSubPaths, startingRefEntry, in_currentTokenizedPath);
        }
      }.bind(this), {
        rootOperation: in_modificationContext.getOperationType(),
        rootTypeid: rootTypeid,
        escapeLeadingDoubleUnderscore: true
      });
  }

  /**
   * This function will call the remove / referenceRemove callbacks registered via DataBinding.registerOnPath() with
   * the appropriate arguments. Additionally, it will take care of unbinding callbacks to reference properties
   * to keep track of changes to referenced properties (if a path handler has been registered that traverses the
   * reference)
   *
   * @param {string[]} in_tokenizedAbsolutePath - the tokenized absolute path for the portion of the
   *     tree we are dealing with.
   * @param {Object} in_registeredSubPaths -
   *     The paths for which the user has registered handlers (this structure has to be rooted at the
   *     same property as the removal context)
   * @param {Object} in_referencePropertySubTable -
   *     The subtree of the reference property table that is rooted at the same property as the removal context
   * @param {Number} in_indirectionsAtRoot - The number of indirections at the root of in_referencePropertySubTable
   * @param {Object} in_options - options for the removal
   * @param {Boolean} in_options.simulated - removals are simulated
   * @param {Boolean} in_options.calledForReferenceTargetChanged -
   *     Was this handler indirectly called by a _referenceTargetChanged handler
   * @param {Boolean} in_options.removeRootCallbacks -
   *     Should any reference target handlers at the root of the tree also be removed?
   * @param {Boolean} in_options.callRootRemovals -
   *     Should we fire removals for the root of the tree?
   * @param {Boolean} in_options.callRemovals - fire removal callbacks where appropriate. Otherwise, just tear down
   *     the handles
   * @private
   * @hidden
   */
  _handleRemovals(
    in_tokenizedAbsolutePath,
    in_registeredSubPaths,
    in_referencePropertySubTable,
    in_indirectionsAtRoot,
    in_options
  ) {
    this._handleRemovalsInternal(
      in_tokenizedAbsolutePath,
      in_registeredSubPaths,
      in_referencePropertySubTable,
      in_indirectionsAtRoot,
      in_options.simulated,
      in_options.calledForReferenceTargetChanged,
      in_options.removeRootCallbacks,
      in_options.callRootRemovals,
      in_options.callRemovals,
      true
    );
  }

  /* eslint-disable complexity */
  /**
   * Implementation of handleRemovals. Wrapper is just to have a default value for in_isRoot and keep
   * _handleRemovals a wee bit cleaner.
   *
   * @inheritdoc _handleRemovals
   * @hidden
   */
  _handleRemovalsInternal(
    in_tokenizedAbsolutePath,
    in_registeredSubPaths,
    in_referencePropertySubTable,
    in_indirectionsAtRoot,
    in_simulated,
    in_calledForReferenceTargetChanged,
    in_removeRootCallbacks,
    in_callRootRemovals,
    in_callRemovals,
    in_isRoot
  ) {
    // We got a remove event, so we should call all registered remove handlers
    const dataBindingHandlers = in_registeredSubPaths ?
      in_registeredSubPaths.__registeredDataBindingHandlers : undefined;
    const registeredData = in_referencePropertySubTable ?
      in_referencePropertySubTable.__registeredData : undefined;

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
      const invokeReferenceRemove = !in_calledForReferenceTargetChanged || (!in_isRoot && isReference);

      // Call remove handlers bound directly to the node
      if (dataBindingHandlers.remove || (invokeReferenceRemove && dataBindingHandlers.referenceRemove)) {
        const tree = this.getDataBinder()._dataBindingTree;
        const node = tree.getNodeForTokenizedPath(in_tokenizedAbsolutePath);
        if (node) {
          const path = tree.generatePathFromTokens(in_tokenizedAbsolutePath);
          const removalContext = new RemovalContext(
            node,
            this,
            path,
            in_simulated
          );
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
      if (keys[i] !== '__registeredDataBindingHandlers' && keys[i] !== '__registeredData') {
        recursiveBasePath.push(keys[i]);
        this._handleRemovalsInternal(
          recursiveBasePath,
          in_registeredSubPaths[keys[i]],
          in_referencePropertySubTable && in_referencePropertySubTable[keys[i]],
          0, // no indirections for any recursive calls
          in_simulated,
          in_calledForReferenceTargetChanged,
          false,  // remove at root is now false, children are not the root
          true,  // call remove for the root on the subtrees, since they are not the root... root
          recursiveCallRemovals, // call any remove/reference remove callbacks on the children
          false // in_isRoot is false for children
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
   * @param {string[]} in_baseTokenizedPath - where the invocation is relative to, compared to 'this' databinding
   * @param {Object} in_registeredPaths - the registered paths to check
   * @param {Property} in_baseProperty - the property from which the registeredPaths are relative to
   * @param {boolean} in_simulated - if true, we are adding in a retroactive case, where the property
   * already existed and we are simulating
   * @param {boolean} in_bindToRef - if true, register callbacks on any reference properties found
   * @param {Object} [in_interestingPaths] - an optional hierarchy of the paths to examine in
   * in_registeredPaths. Only paths in this hierarchy and in in_registeredPaths will be considered. By hierarchy,
   * we mean {a: {b: {}, c: { d:{}}}} will only visit a.b and a.c.d
   * @param {DataBinderHandle} [in_handle] - restrict the invocation to only registrations relating to in_handle
   *
   * @private
   * @hidden
   */
  _invokeInsertCallbacksForPaths(
    in_baseTokenizedPath,
    in_registeredPaths,
    in_baseProperty,
    in_simulated,
    in_bindToRef,
    in_interestingPaths,
    in_handle
  ) {
    const registrationId = in_handle ? in_handle.getUserData().registrationId : undefined;
    const traversalStack = [];
    traversalStack.push({
      interestingPaths: in_interestingPaths,
      registeredPaths: in_registeredPaths,
      parentProperty: in_baseProperty,
      traversalPath: [],
      traversalToken: undefined
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
      let currentProperty = undefined;
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
      let currentReferenceProperty = undefined;
      const isProperty = currentProperty instanceof BaseProperty;
      if (isProperty && TypeIdHelper.isReferenceTypeId(currentProperty.getFullTypeid())) {
        // It is a reference -- follow the reference to the eventual target.
        currentReferenceProperty = currentProperty;
        currentProperty = undefined;
        try {
          currentProperty = currentReferenceProperty.get();
        } catch (error) {
          // 'OK'; leave undefined
        }
      }

      if (registeredPaths && registeredPaths.__registeredDataBindingHandlers) {
        // Invoke insert handlers
        if (currentProperty && !currentReferenceProperty && registeredPaths.__registeredDataBindingHandlers.insert) {
          const modificationContext = new ModificationContext(
            undefined,
            'insert',
            currentProperty.getAbsolutePath(),
            currentProperty.getContext(),
            this,
            in_baseTokenizedPath.concat(traversalPath),
            in_simulated
          );
          // Since we have the property, cache it on the context to avoid recomputation
          modificationContext._hintModifiedProperty(currentProperty);
          _.each(registeredPaths.__registeredDataBindingHandlers.insert, function(in_handler) {
            // the insert handlers probably should always be called (TODO: even w.r.t. bindToReference?)
            // console.log('calling insert for: ' + traversalPath + ' currentProperty: ' + currentProperty);
            // note that the nested ChangeSet supplied is undefined!
            if (registrationId === undefined || in_handler.registrationId === registrationId) {
              in_handler.pathCallback.call(this, modificationContext);
            }
          }, this);
        }
        if (currentReferenceProperty && registeredPaths.__registeredDataBindingHandlers.referenceInsert) {
          const modificationContext = new ModificationContext(
            undefined,
            'insert',
            currentReferenceProperty.getAbsolutePath(),
            currentReferenceProperty.getContext(),
            this,
            in_baseTokenizedPath.concat(traversalPath),
            in_simulated,
            true // bound to the reference
          );
          // Since we have the property, cache it on the context to avoid recomputation
          modificationContext._hintModifiedProperty(currentReferenceProperty);
          _.each(registeredPaths.__registeredDataBindingHandlers.referenceInsert, function(in_handler) {
            if (registrationId === undefined || in_handler.registrationId === registrationId) {
              in_handler.pathCallback.call(this, modificationContext);
            }
          }, this);
        }
        if (currentProperty && registeredPaths.__registeredDataBindingHandlers.collectionInsert) {
          _.each(registeredPaths.__registeredDataBindingHandlers.collectionInsert, function(in_handler) {
            const rightId = (registrationId === undefined || in_handler.registrationId === registrationId);
            const isContainer = currentProperty.getContext() === 'array' ||
              currentProperty.getContext() === 'map' ||
              currentProperty.getContext() === 'set';
            if (rightId && isContainer) {
              const keys = currentProperty.getIds();
              const keyedPath = in_baseTokenizedPath.concat(traversalPath);
              for (let k = 0; k < keys.length; k++) {
                let currentKey = keys[k];
                if (currentProperty.getContext() === 'array') {
                  currentKey = parseInt(currentKey, 10);
                }
                let quotedKey = currentKey;
                if (currentProperty.getContext() !== 'array') {
                  quotedKey = PathHelper.quotePathSegmentIfNeeded(currentKey);
                }
                keyedPath.push(quotedKey);
                // Note, currentProperty here is not the root, so we can simply concatenate [quotedKey]
                const modificationContext = new ModificationContext(
                  undefined,
                  'insert',
                  currentProperty.getAbsolutePath() + '[' + quotedKey + ']',
                  currentProperty.getContext(), // shouldn't this be the context of the collection item?
                  this,
                  keyedPath,
                  in_simulated
                );

                in_handler.pathCallback.call(this, currentKey, modificationContext);
                keyedPath.pop();
              }
            }
          }, this);
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
          if (keys[i] !== '__registeredDataBindingHandlers' && keys[i] !== '__registeredData') {
            const token = unescapeTokenizedStringForMap(keys[i]);
            traversalStack.push({
              interestingPaths: interestingPaths ? interestingPaths[keys[i]] : undefined,
              registeredPaths: registeredPaths[keys[i]],
              traversalToken: token,
              traversalPath: traversalPath.concat(token),
              parentProperty: currentProperty
            });
          }
        }
      }

      if (currentReferenceProperty && in_bindToRef) {
        if (!currentProperty || currentProperty.getContext() === 'single') {
          // console.log('added reference from:' + referencePath + ' to: ' + path);
          this._registerCallbacksForSingleReferenceProperty(
            traversalPath,
            [],
            registeredPaths,
            this._referencePropertyTable,
            0, // level is 0
            currentReferenceProperty,
            undefined,
            true, // registering retroactively
            undefined
          );
        } else {
          console.error('Only single references are currently supported for references (LYNXDEV-5016)');
        }
      }

    }
  }

  /**
   * Augments the prototype of the given data binding class to call the given function for events at the given path(s)
   *
   * @param {DataBinding} in_dataBindingConstructor -
   *     constructor object for the data binding class
   * @param {Array.<string>|string}         in_path -
   *     the property path(s) for which the function should be called
   * @param {Array.<string>} in_operations -
   *     the operations for which the callback function gets called
   *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove',
   *     'referenceInsert', 'referenceModify', 'referenceRemove')
   * @param {function}       in_function -
   *     the function to invoke
   * @param {Object}         [in_options] -
   *     Additional user specified options for the callback and its registration
   * @param {Boolean} [in_options.isDeferred] -
   *     If true, the callback is executed after the current ChangeSet processing is complete. The default is false.
   *
   * @return {DataBinderHandle} a handle to unregister this _registerOnPath with
   * @package
   * @hidden
   */
  _registerOnPath(
    in_dataBindingConstructor, in_path, in_operations, in_function, in_options = {}
  ) {
    // We support registering on path for absolute path callbacks, and our databinding is marked as internal
    if (!in_dataBindingConstructor.__absolutePathInternalBinding) {
      if (isDataBindingRegistered(in_dataBindingConstructor)) {
        throw new Error('Registering on path after the DataBinding has been registered with a DataBinder.');
      }
    }

    const referenceChangedIdx = in_operations.indexOf('referenceChanged');
    const filteredOperations = in_operations.slice();
    if (referenceChangedIdx !== -1) {
      // I think this is the first time I've used the full splice function for it's actual initial design.
      filteredOperations.splice(referenceChangedIdx, 1, 'insert', 'remove');
      console.warn('referenceChanged is deprecated. Short term, the binding is being replaced with the ' +
        'pair insert and remove, but this may not exactly mimic all the functionality of the ' +
        'deprecated feature'
      );
    }
    if (in_options && in_options.replaceExisting !== undefined) {
      console.warn('replaceExisting is deprecated. The behavior is now as if replaceExisting is false');
    }

    if (!in_function) {
      // Common to mistake this.myFunc vs. this.prototype.myFunc.
      throw new Error('No callback provided to DataBinding registration function (are you missing this.prototype?)');
    }

    // Install a callback that will allow the querying of _registerPaths etc. on all the prototypes.
    installForEachPrototypeMember(in_dataBindingConstructor);

    // copy the options that are relevant to how the callback is called into an options object that is stored
    // along with the callback (but only if we have to). Currently this is just 'bindToReference'
    const callback = in_options.isDeferred ? deferCallback.call(this, in_function) : in_function;

    const paths = _.isArray(in_path) ? in_path : [in_path];

    var tokenizedPaths = _.map(paths, p => PathHelper.tokenizePathString(p));
    var escapedPaths = _.map(tokenizedPaths, p => escapeTokenizedPathForMap(p));

    // Create a handle to represent this registration.
    const handle = createHandle(in_dataBindingConstructor, escapedPaths, filteredOperations, callback);

    // Keep a central list of all the handles, so unregisterAllOnPathListeners can unregister them
    // all.
    const allPathHandles = getOrCreateMemberOnPrototype(in_dataBindingConstructor, '_allPathHandles', []);
    allPathHandles.push(handle);

    return handle;
  }

  /**
   * Augments the prototype of the given DataBinding class to call the given function for events at the given path.
   * The callback will get the property at that path as parameter (or undefined if the property no longer exists, e.g.
   * after a delete or reference change).
   *
   * @param {DataBinding} in_dataBindingConstructor -
   *     constructor object for the data binding class
   * @param {string}         in_path -
   *     the property path for which the function should be called on modify() events
   * @param {Array.<string>} in_operations -
   *     the operations for which the callback function gets called
   *     (one of 'insert', 'modify', 'remove', 'collectionInsert', 'collectionModify', 'collectionRemove')
   * @param {function}       in_function -
   *     the function to add
   * @param {Object}         [in_options] -
   *     Additional user specified options for the callback and its registration
   * @param {Boolean}        [in_options.requireProperty] -
   *     If true the callback will only be called if the corresponding Property exists, i.e. it won't be called for
   *     'remove' events. The default is false.
   * @package
   * @hidden
   */
  _registerOnProperty(
    in_dataBindingConstructor, in_path, in_operations, in_function, in_options
  ) {
    var requireProperty = in_options && in_options.requireProperty;
    DataBinding.prototype._registerOnPath(in_dataBindingConstructor, in_path, in_operations,
      function() {
        if (arguments.length > 1) {
          invokeWithCollectionProperty.call(this, in_function, requireProperty, arguments[0], arguments[1]);
        } else {
          invokeWithProperty.call(this, in_function, requireProperty, arguments[0]);
        }
      }, in_options);
  }

  /**
   * NOTE: Deprecated
   *
   * Helper function to return the runtime object associated to the property this DataBinding is associated with.
   * By default, it will return the runtime representation for the same binding type of the DataBinding, i.e.,
   * as returned by {@link DataBinding.getDataBindingType}.
   *
   * Runtime representations are defined with {@link DataBinder.defineRepresentation}
   *
   * @param {string=} in_bindingType -binding type to fetch; if not specified it will use the same binding
   *   type as the DataBinding.
   *
   * @return {Object|undefined} The runtime representation associated with the property this binding is associated
   * with, or undefined if there is no runtime representation registered for this binding type.
   *
   * @deprecated Please use {@link DataBinding.getRepresentation} instead.
   */
  getRuntimeModel(in_bindingType = undefined) {
    console.warn('DataBinding.getRuntimeModel is deprecated. Please use DataBinding.getRepresentation instead.');
    return this.getRepresentation(in_bindingType);
  }

  /**
   * Helper function to return the runtime object associated to the property this DataBinding is associated with.
   * By default, it will return the runtime representation for the same binding type of the DataBinding, i.e.,
   * {@link DataBinding.getDataBindingType}.
   *
   * Runtime representations are defined with {@link DataBinder.defineRepresentation}
   *
   * @param {string=} in_bindingType - binding type to fetch; if not specified it will use the same
   *   binding type as the DataBinding.
   *
   * @return {Object|undefined} The runtime representation associated with the property this binding
   *   is associated with, or undefined if there is no runtime representation registered for this
   *   binding type. If the property associated with this binding is already removed, it throws.
   *
   * @throws If the property associated with this DataBinding does not exist anymore (e.g. in onRemove() callbacks)
   */
  getRepresentation(in_bindingType = undefined) {
    return this.getDataBinder().getRepresentation(this.getProperty(), in_bindingType || this.getDataBindingType());
  }

  /**
   * Register a callback to a relative property path. It will be triggered on the given events. The callback will
   * receive the HFDM property (at the relative path) as a parameter.
   *
   * @example
   * @snippet javascript 'test/data_binder/data_binding.spec.js'
   *      SnippetStart{DataBinding.registerOnProperty} SnippetEnd{DataBinding.registerOnProperty}
   *
   * @param {string} in_path Relative property path.
   * @param {Array.<String>} in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
   * @param {Function} in_callback The function to call, when the property behind the relative path changes. It receives
   * the property found via path, and a key / index if it gets triggered for one of the collection events.
   * @param {IRegisterOnPropertyOptions} in_options  Additional user specified options on how the callback should be
   * registered.
   * @public
   */
  static registerOnProperty(in_path, in_events, in_callback, in_options = {}) {
    if (_.isArray(in_path)) {
      throw new Error('Multiple paths not supported for registerOnProperty');
    }
    DataBinding.prototype._registerOnProperty(this, in_path, in_events, in_callback, in_options);
  }

  /**
   * Register a callback to a property path relative to the property associated with the databinding. It will
   * be triggered on the given events.
   * If multiple paths are provided for 'in_path', the callback will only be called once per HFDM changeset
   *
   * See {@link DataBinding.registerOnProperty} for an example; the only difference is the callback will
   * receive a {@link ModificationContext}.
   *
   * @param {Array.<string>|string} in_path Path(s) relative to the HFDM property to bind on changes.
   * @param {Array.<String>} in_events Array of the event names to bind to:<br>
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
   * @param {Function} in_callback The function to call when the property behind the relative path changes.
   * @param {IRegisterOnPathOptions} in_options Additional user specified options on how the callback should be
   * registered.
   * @public
   */
  static registerOnPath(in_path, in_events, in_callback, in_options = {}) {
    DataBinding.prototype._registerOnPath(this, in_path, in_events, in_callback, in_options);
  }

  /**
   * Same as registerOnProperty, but the callback will get a JSON representation of the value of the property.
   *
   * See {@link DataBinding.registerOnProperty} for an example; the only difference is the callback will
   * receive a JSON representation of the value of the property.
   *
   * @param {string} in_path Path relative to the HFDM property to bind on value changes.
   * @param {Array.<String>} in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
   * @param {Function} in_callback The function to call, when the property behind the relative path changes.
   * @param {IRegisterOnPathOptions} in_options Additional user specified options on how the callback should be
   * registered.
   *
   * @public
   */
  static registerOnValues(in_path, in_events, in_callback, in_options = {}) {
    if (_.isArray(in_path)) {
      throw new Error('Multiple paths not supported for registerOnValues');
    }
    this._handleBinding(this._registerOnValues,
      in_path, in_events, in_callback, in_options);
  }

  /**
   * Same as registerOnProperty, but the callback will get a JSON representation of the property.
   * @param {string} in_path Path relative to the HFDM property to bind on value changes.
   * @param {Array.<String>} in_events Array of the event names to bind to: modify, insert, remove.
   * @param {Function} in_callback The function to call, when the property behind the relative path changes.
   * @param {Object} in_options Additional user specified options on how the callback should be registered.
   *
   * @private
   * @hidden
   */
  static _registerOnValues(in_path, in_events, in_callback, in_options = {}) {
    this.registerOnProperty(in_path, in_events, function(property) {
      in_callback.call(this, property.isPrimitiveType() ? property.getValue() : property.getValues());
    }, in_options);
  }

  /**
   * Same as registerOnProperty, but the callback will get a JSON representation of the property.
   * @param {function} in_register A function to register relative path callbacks.
   * @param {string} in_path Path relative to the HFDM property to bind on value changes.
   * @param {Array.<String>} in_events See {@link DataBinding.registerOnPath [events]} parameter
   * @param {function} in_callback See {@link DataBinding.registerOnPath [callback]} parameter
   * @param {Object} in_options See {@link DataBinding.registerOnPath [options]} parameter
   *
   * @private
   * @hidden
   */
  static _handleBinding(in_register, in_path, in_events, in_callback, in_options = {}) {
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
 * values are changed in the corresponding HFDM property.
 *
 * @example
 * @snippet javascript 'test/data_binder/es6_decorator_data_binding.spec.js'
 *      SnippetStart{onValueDecorator} SnippetEnd{onValueDecorator}
 *
 * @param {string} in_path Path relative to the HFDM property to bind on value changes.
 * @param {Array.<String>} in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param {IRegisterOnPathOptions} in_options Additional user specified options on how the callback should be
 * registered.
 * @return {function} A function that registers the decorated callback using registerOnValues.
 * @public
 */
const onValuesChanged = function(in_path, in_events, in_options = {}) {
  return createRegistrationFunction('registerOnValues', arguments);
};

/**
 * Function to use as a decorator when defining a DataBinding class. When prefixed before a function
 * on your databinding class, the class will be statically extended to automatically be called back when the
 * corresponding HFDM property is changed.
 *
 * See {@link onValuesChanged} for an example of using decorators. The callback will receive a property
 * instead of a value.
 *
 * @param {string} in_path Path relative to the HFDM property to bind on property changes.
 * @param {Array.<String>} in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param {IRegisterOnPathOptions} in_options Additional user specified options on how the callback should be
 * registered.
 * @return {function} A function that registers the decorated callback using registerOnProperty.
 * @public
 */
const onPropertyChanged = function(in_path, in_events, in_options = {}) {
  return createRegistrationFunction('registerOnProperty', arguments);
};

/**
 * Function to use as a decorator when defining a DataBinding class. When prefixed before a function
 * on your databinding class, the class will be statically extended to automatically be called back when the
 * corresponding HFDM property is changed.
 *
 * If multiple paths are provided for 'in_path', the callback will only be called once per HFDM change set
 *
 * See {@link onValuesChanged} for an example of using decorators. The callback will receive a
 * {@link ModificationContext} instead of a value.
 *
 * @param {Array.<string>|string} in_path Path(s) relative to the HFDM property to bind on changes.
 * @param {Array.<String>} in_events See the `in_events` parameter in {@link DataBinding.registerOnPath}
 * @param {IRegisterOnPathOptions} in_options Additional user specified options on how the callback should be
 * registered.
 * @return {function} A function that registers the decorated callback using registerOnPath.
 * @public
 */
const onPathChanged = function(in_path, in_events, in_options = {}) {
  return createRegistrationFunction('registerOnPath', arguments);
};

export { DataBinding, onValuesChanged, onPropertyChanged, onPathChanged };
