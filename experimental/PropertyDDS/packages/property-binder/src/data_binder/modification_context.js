/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Provides the contextual information for the onModify callbacks.
 */

import { DataBinding } from './data_binding'; /* eslint-disable-line no-unused-vars */
import { BaseProperty } from '@fluid-experimental/property-properties'; /* eslint-disable-line no-unused-vars */
import { BaseContext } from './base_context';
import { PropertyElement } from '../internal/property_element';

/**
 * Provides the contextual information for the onModify callbacks.
 * @alias ModificationContext
 * @extends BaseContext
 * @public
 */
class ModificationContext extends BaseContext {
  /**
   * @param {external:SerializedChangeSet} in_nestedChangeSet -
   *     The ChangeSet represented by the modification context
   * @param {string} in_operationType -
   *     The operation type that has been applied to the root of the ChangeSet. It can take one of the following values:
   *     of 'insert', 'modify' or 'remove'
   * @param {string} in_path -
   *     The full path to the property that is modified
   * @param {string} in_context -
   *     The context in which this ChangeSet is applied. It can take one of the following values:
   *     'single', 'map', 'set', 'array', 'template' or 'root'
   * @param {DataBinding} in_baseDataBinding -
   *     The data binding which triggered the event this modification context refers to. Used when this
   *     ModificationContext is created for a sub-path notification.
   * @param {Array.<String>} in_relativeTokenizedPath -
   *     Tokenized path from the base Data Binding to the root of this ModificationContext. Used when this
   *     ModificationContext is created for a sub-path notification.
   * @param {Boolean} in_simulated - if true, the modification is being done retroactively on properties
   *     that already existed in the workspace, i.e., the modification is being simulated. Default is false.
   * @param {Boolean} in_boundToRef - if true, the modification occurred on the
   *     reference and not on the referred object. Default is false.
   *
   * @constructor
   * @package
   * @hideconstructor
   * @hidden
   */
  constructor(in_nestedChangeSet,
    in_operationType,
    in_path,
    in_context,
    in_baseDataBinding = undefined,
    in_relativeTokenizedPath = [],
    in_simulated = false,
    in_boundToRef = false
  ) {
    super(in_operationType, in_context, in_path, in_baseDataBinding, in_nestedChangeSet, in_simulated);
    this._relativeTokenizedPath = in_relativeTokenizedPath;
    this._removedDataBindingPath = undefined;
    this._propertyHint = undefined;
    this._boundToRef = in_boundToRef;
  }

  /**
   * Returns the data binding (if it exists) at the path associated with this the modification.
   * If an optional binding type is supplied, data bindings that correspond to that type are returned, otherwise data
   * bindings which have the same type as the binding that triggered the event of this modificationContext are returned.
   *
   * @param {string} in_bindingType - The requested data binding type. If none has been given, data bindings with
   *   the same data binding type as the DataBinding that triggered this modification context are returned.
   * @return {DataBinding|undefined} A data binding (defined for the given bindingType)
   *   which may be empty, if no data binding of the given type is present at the path associated
   *   with this modification.
   * @public
   */
  getDataBinding(in_bindingType = '') {
    if (!this._baseDataBinding) {
      return undefined;
    }
    if (this._operationType === 'remove') {
      var path = this._removedDataBindingPath ? this._removedDataBindingPath : this._path;
      return this._baseDataBinding.getDataBinder()._resolveRemovedDataBindingByType(path, in_bindingType ||
          this._baseDataBinding.getDataBindingType());
    } else {
      let binding;
      // This will take care of dereferencing if necessary.
      const element = this._getPropertyElement();
      const prop = element.getProperty();
      if (prop) {
        const tree = this._baseDataBinding.getDataBinder()._dataBindingTree;
        const node = tree.getNode(element.getAbsolutePath());
        if (node) {
          binding = node.getDataBindingByType(
            in_bindingType || this._baseDataBinding.getDataBindingType()
          );
        }
      }
      return binding;
    }
  }

  /**
   * Return the property element at the root of the modification.
   *
   * @return {PropertyElement} a property element representing the property at the root of the modification
   *
   * @hidden
   */
  _getPropertyElement() {
    if (this._propertyHint) {
      // Property explicitly set by the internals. Use that.
      return new PropertyElement(this._propertyHint);
    } else if (this._baseDataBinding) {
      // Return the element relative to the base property
      return this._baseDataBinding.getPropertyElementForTokenizedPath(this._relativeTokenizedPath, !this._boundToRef);
    } else {
      // None, return an invalid one
      return new PropertyElement();
    }
  }

  /**
   * Returns the Property at the root of the modification.
   *
   * NOTE: If this ModificationContext is the result of registerOnPath with multiple subpaths, the property will
   * be undefined (since it is not unique). In this case, fetch the properties manually relative to the DataBinding.
   *
   * In the case of an element within a primitive collection (e.g., an Array of strings), this will give the
   * array.
   *
   * @return {BaseProperty} The property at the root of this modification.
   * @public
   */
  getProperty() {
    if (this._propertyHint) {
      return this._propertyHint;
    }

    const element = this._getPropertyElement();
    if (element.isValid()) {
      return element.getProperty();
    } else {
      // Invalid path, or leads to a primitive collection element.
      return undefined;
    }
  }

  /**
   * Returns the current path to the removed Data Binding that is used when querying for removed data bindings.
   *
   * @return {string}  the current path
   * @package
   * @hidden
   */
  _getRemovedDataBindingPath() {
    return this._removedDataBindingPath;
  }

  /**
   * Create a modification context from the information contained in a traversal context.
   *
   * @param {external:TraversalContext} in_traversalContext - traversal context
   * @param {DataBinding} in_baseDataBinding -
   *     The DataBinding which triggered the event this modification context refers to. Used when this
   *     ModificationContext is created for a sub-path notification.
   * @param {Array.<String>} in_relativeTokenizedPath -
   *     Tokenized path from the base Data Binding to the root of this ModificationContext. Used when this
   *     ModificationContext is created for a sub-path notification.
   * @param {Boolean} in_boundToRef - if true, the context refers to the reference, and not the referenced object
   * @return {ModificationContext} Modification context from traversal context
   * @package
   * @hidden
   */
  static _fromContext(in_traversalContext, in_baseDataBinding, in_relativeTokenizedPath, in_boundToRef) {
    return new ModificationContext(
      in_traversalContext.getNestedChangeSet(),
      in_traversalContext.getOperationType(),
      in_traversalContext.getFullPostPath(),
      in_traversalContext.getPropertyContainerType(),
      in_baseDataBinding,
      in_relativeTokenizedPath,
      in_traversalContext.getUserData().retroactive,
      in_boundToRef
    );
  }

  /**
   * Sets the Property associated with this context. This overrides the contained Binding's associated Property.
   * This is used as a hint if the creator of the modification context happens to already know the property.
   *
   * @param {BaseProperty} in_property - the Property that should be associated with this context.
   * @package
   * @hidden
   */
  _hintModifiedProperty(in_property) {
    this._propertyHint = in_property;
  }

  /**
   * Sets the path to the removed Data Binding that is used when querying DataBinder for removed data bindings.
   *
   * @param {string} in_removedDataBindingPath - the suffix that should make the path unique
   * @package
   * @hidden
   */
  _setRemovedDataBindingPath(in_removedDataBindingPath) {
    this._removedDataBindingPath = in_removedDataBindingPath;
  }

  /**
   * clones the context object
   *
   * @return {ModificationContext} the cloned context
   * @package
   * @hidden
   */
  _clone() {
    const clone = new ModificationContext(
      this._nestedChangeSet,
      this._operationType,
      this._path,
      this._context,
      this._baseDataBinding,
      this._relativeTokenizedPath.slice(),
      this._simulated,
      this._boundToRef
    );
    // we need to manually copy these
    clone._removedDataBindingPath = this._removedDataBindingPath;
    clone._propertyHint = this._propertyHint;
    return clone;
  }

  /**
   * Return the tokenized path relative to the DataBinding on which we are called.
   * For a path registered on the DataBinder, this path will be relative to the root.
   *
   * @return {Array.<String>} the tokenized path, relative to the binding point
   * @public
   */
  getRelativeTokenizedPath() {
    return this._relativeTokenizedPath;
  }
}

export { ModificationContext};
