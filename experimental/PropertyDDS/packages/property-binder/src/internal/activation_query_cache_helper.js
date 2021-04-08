/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
import { PropertyFactory } from '@fluid-experimental/property-properties';
import { TypeIdHelper } from '@fluid-experimental/property-changeset';

import * as _ from 'underscore';
import { getLocalOrRemoteSchema } from '../data_binder/internal_utils';

/**
 * The ActivationQueryCacheHelper is a helper class to be able to cache whether there is the _possibility_ of
 * a binding in the hierarchy of a property, based on the _static_ definition of the type.
 * The mechanism searches in the type, and checks if any of the statically defined children may have bindings
 * for the given binding type. If it finds a node property, it cannot conclude anything, and will conservatively
 * return 'true', that a binding may be encountered.
 *
 * @hidden
 */
export class ActivationQueryCacheHelper {
  /**
   * Constructor of the helper.
   *
   * @param {Object[]} in_activations - the activations that are being performed
   * @param {DataBinder} in_dataBinder - the databinder instance
   */
  constructor(in_activations, in_dataBinder) {
    this._activations = in_activations;
    this._dataBinder = in_dataBinder;
    this._workspace = in_dataBinder.getWorkspace();
    this._childrenCache = {};
    this._hierarchyCache = {};
    this._typeCache = {};
  }

  /**
   * Returns true if there is a chance that one of our relevant types might be found in one of the children
   * properties of a property of the given typeid.
   *
   * @param {string} in_typeid - the typeid for which we are interested
   * @return {boolean} true if the given type may occur in the children subhierarchies
   */
  childrenMayHaveBindings(in_typeid) {
    let entry = this._childrenCache[in_typeid];
    if (entry === undefined) {
      // New type. Determine if there is potentially a type of interest in the subhierarchy.
      entry = false;

      const splitTypeID = TypeIdHelper.extractContext(in_typeid);
      if (this._isCollectionType(splitTypeID)) {
        // Then our children are the collection elements; see if the elements may contain bindings
        entry = this.hierarchyMayHaveBindings(splitTypeID.typeid);
      } else if (PropertyFactory.inheritsFrom(in_typeid, 'NodeProperty', { workspace: this._workspace })) {
        // If type inherits from NodeProperty, then any dynamic children may have bindings
        entry = true;
      } else {
        // Need to check the actual types of the children more carefully.
        // Note, we don't check the root of the template; we are only interested in the children properties
        const template = getLocalOrRemoteSchema(in_typeid, this._workspace);
        if (template && template.properties) {
          const checkNested = properties => {
            let result = false;
            for (let i = 0; !result && i < properties.length; ++i) {
              if (properties[i].typeid) {
                // Typed; use ourselves recursively to determine whether this subhierarchy applies
                let childType = properties[i].typeid;
                if (this._isCollectionType(properties[i])) {
                  childType = properties[i].context + '<' + childType + '>';
                }
                result = this.hierarchyMayHaveBindings(childType);
              } else if (properties[i].properties) {
                result = checkNested(properties[i].properties);
              }
            }
            return result;
          };
          entry = checkNested(template.properties);
        }
        if (!entry) {
          // Recurse on any inherited types.
          const inherited = this._getInheritedTypes(in_typeid);
          for (let i = 0; !entry && i < inherited.length; ++i) {
            entry = this.childrenMayHaveBindings(inherited[i]);
          }
        }
      }
      this._childrenCache[in_typeid] = entry;
    }
    return entry;
  }

  /**
   * Returns true if there is a chance that one of the properties in the hierarchy of the given types may
   * potentially contain a databinding, _including_ the root.
   *
   * @param {string} in_typeid - the typeid for which we are interested
   * @return {boolean} true if a databinding may occur in the subhierarchy of a property of the given type,
   *   including the root
   */
  hierarchyMayHaveBindings(in_typeid) {
    let entry = this._hierarchyCache[in_typeid];
    if (entry === undefined) {
      // New type
      entry = false;
      const splitTypeID = TypeIdHelper.extractContext(in_typeid);
      if (!this._isCollectionType(splitTypeID) &&
        PropertyFactory.inheritsFrom(in_typeid, 'NodeProperty', { workspace: this._workspace })) {
        // No need to check any further. If the queried type is a shade of NodeProperty, then any dynamic children
        // may have bindings
        entry = true;
      } else {
        // Check if the root - and only the root - of the type has a binding
        entry = this.typeRootBindings(in_typeid).length !== 0;

        // If the root of the type hierarchy doesn't have a binding, check to see if any of the children of the root
        // (directly or through inheritance) may potentially have bindings.
        entry = entry || this.childrenMayHaveBindings(in_typeid);
      }
      this._hierarchyCache[in_typeid] = entry;
    }
    return entry;
  }

  /**
   * Return whether the root of the hierarchy defined by the type provided has a binding.
   *
   * @param {string} in_typeid - the typeid for which we are interested
   *
   * @return {boolean} true if the root of the type (children not checked) has a binding
   */
  typeRootBindings(in_typeid) {
    let entry = this._typeCache[in_typeid];
    if (entry === undefined) {
      // New type
      entry = [];

      const propertySplitType = TypeIdHelper.extractContext(in_typeid);
      for (let i = 0; i < this._activations.length; ++i) {
        const rule = this._activations[i];

        // Get all the definitions for this typeid, and then filter them for ones that are activated.
        const definitions = this._dataBinder._registry.getApplicableBindingDefinitions(
          in_typeid, rule.bindingType, this._workspace
        ).filter(definition => {
          return this._dataBinder._activationAppliesToTypeId(
            rule.activationSplitType,
            propertySplitType,
            definition.splitType
          );
        });

        if (definitions.length > 0) {
          // Note that definitions will always have only a single entry when the binding type is provided
          entry.push({
            rule: rule,
            definition: definitions[0]
          });
        }
      }

      this._typeCache[in_typeid] = entry;
    }
    return entry;
  }

  /**
   * Get the direct inherits of the given typeid
   *
   * @param {string} in_typeid - the typeid from which we want to get the inherited types
   *
   * @return {string[]} all the inheriting types
   */
  _getInheritedTypes(in_typeid) {
    const newInheritedTemplates = getLocalOrRemoteSchema(in_typeid, this._workspace);
    let inherited = (newInheritedTemplates && newInheritedTemplates.inherits) || [];

    // The inherited entry may be a simple string (hole in the HFDM template validator? LYNXDEV-8894)
    if (!_.isArray(inherited)) {
      inherited = [inherited];
    }

    return inherited;
  }

  /**
   * Returns true if the context is a collection context
   *
   * @param {{context: string, typeid: string}} in_splitType - the split type to check
   * @return {boolean} true if the type provided is a collection
   */
  _isCollectionType(in_splitType) {
    return in_splitType.context === 'array' || in_splitType.context === 'map' || in_splitType.context === 'set';
  }
}
