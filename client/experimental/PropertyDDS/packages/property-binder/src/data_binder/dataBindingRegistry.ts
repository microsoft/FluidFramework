/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SemverMap, UpgradeType } from '../internal/semvermap';
import { getLocalOrRemoteSchema } from './internalUtils';
import { TypeIdHelper } from '@fluid-experimental/property-changeset';
import { DataBindingDefinition } from './dataBinder';
import { SharedPropertyTree } from '@fluid-experimental/property-dds';

/**
 * A DataBindingRegistry allows one to register and create representations.  The type of the representation is
 * provided (ex. 'BINDING', 'DRAW', 'UI', etc.), along with its creation function, and an id for this registration.
 * The id for the registration is usually the type id of the objects being represented (like a PropertySet template
 * id).
 *
 * Common representations are data bindings (business objects) representing property sets, and UI or Graphics
 * representing data bindings.
 * @hidden
 */
export class DataBindingRegistry {

  private _applicableBindingCache = new Map<string, any>();
  private _bindingTypeMap = new Map<string, SemverMap>();

  /**
   * Registers a Data Binding.
   *
   * This function allows registering multiple data bindings for the same id. The bindings registered here will later
   * be created in the same order in which they have been registered. The same DataBindingObject may be registered
   * multiple times and there are no checks to prevent this
   *
   * @param bindingType - The type of the representation.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
   * @param typeid - The id to use for this registration, usually the type id of the objects being represented
   *                    (like a PropertySet template id).
   * @param upgradeType - What semver range this data binding applies to.
   * @param dataBindingObject - The Data Binding and its associated metadata.
   * @public
   */
  public register(bindingType: string, typeid: string, upgradeType: UpgradeType, dataBindingObject: DataBindingDefinition) {
    // Clear our cache
    this._applicableBindingCache = new Map<string, any>();

    let rules = this._bindingTypeMap.get(bindingType);
    if (!rules) {
      rules = new SemverMap();
      this._bindingTypeMap.set(bindingType, rules);
    }
    rules.add(typeid, upgradeType, dataBindingObject);
  }

  /**
   * Unregisters a Data Binding.
   *
   * @param bindingType - The type of the representation.
   * @param typeid - The registration id.
   * @returns True if the representation was successfully removed
   * @public
   */
  public unregister(bindingType: string, typeid: string): boolean {
    // Clear our cache
    this._applicableBindingCache = new Map<string, any>();

    const rules = this._bindingTypeMap.get(bindingType);
    if (!rules) {
      throw new Error('Trying to unregister DataBinding of unknown bindingType');
    }
    if (!rules.remove(typeid)) {
      throw new Error('Trying to unregister DataBinding of unknown typeid');
    }

    return true;
  }

  /**
   * @param bindingType - The type of the representation.
   * @param typeid - The registration id.
   * @returns true if there is a precise rule for this bindingtype/typeid pair
   * @public
   */
  public has(bindingType: string, typeid: string): boolean {
    const rules = this._bindingTypeMap.get(bindingType);
    if (!rules) {
      return false;
    }
    return rules.has(typeid);
  }

  /**
   * Return all the bindings that apply to this type
   *
   * @param in_typeId - the type for which we want binding definitions
   * @param in_requestedBindingType - a specific binding type to filter for, all are returned if no type
   *   provided
   * @param in_propertyTree - the current Property Tree, if present
   *
   * @returns Array of applicable bindings
   *
   * @private
   */
  public getApplicableBindingDefinitions(in_typeId: string, in_requestedBindingType?: string, in_propertyTree?: SharedPropertyTree): any[] {
    const key = in_typeId + '.' + in_requestedBindingType; // in_requestedBindingType may be undefined; it's ok
    let lookup = this._applicableBindingCache[key];
    if (!lookup) {
      // Check if the typeID is registered or if a parent typeID is.
      const applicableBindings: any[] = [];
      this._bindingTypeMap.forEach((rules, bindingType) => {
        if (!in_requestedBindingType || bindingType === in_requestedBindingType) {
          try {
            const definition = this.getRegisteredDefinition(in_typeId, bindingType, in_propertyTree);
            if (definition) {
              applicableBindings.push(definition);
            }
          } catch (err) {
            console.log(err);
          }
        }
      }, this);
      lookup = this._applicableBindingCache[key] = applicableBindings;
    }
    return lookup;
  }

  /**
   * Given a typeid and binding type, the function returns the most appropriate databinding definition, taking
   * inheritance into account.
   *
   * @param in_typeid - The typeid of the property to query for
   * @param in_bindingType - The registered DataBinding must have this binding type to be considered.
   * @param in_propertyTree - the current property Tree, if present
   * @returns  The definition a registered template or null if no template is found.
   */
  public getRegisteredDefinition(in_typeid: string, in_bindingType: string, in_propertyTree?: SharedPropertyTree): object | null {
    const rules = this._bindingTypeMap.get(in_bindingType);
    if (!rules) {
      return null;
    }

    let match;

    const splitTypeID = TypeIdHelper.extractContext(in_typeid);
    let typeidQueue = [splitTypeID.typeid];
    let serializedTypeid;

    // BFS of the templates and return the first registered one (closest)
    while (typeidQueue.length > 0) {
      const currentTypeid = typeidQueue.shift() as string;
      serializedTypeid = currentTypeid;
      if (splitTypeID.context !== 'single') {
        serializedTypeid = TypeIdHelper.createSerializationTypeId(currentTypeid, splitTypeID.context,
          splitTypeID.isEnum);
      }
      match = rules.best(serializedTypeid);
      if (match) {
        return match;
      }

      // Push any parent templates on to the queue
      const newInheritedTemplates = TypeIdHelper.isReferenceTypeId(currentTypeid) ? undefined :
        getLocalOrRemoteSchema(currentTypeid);
      if (newInheritedTemplates && newInheritedTemplates.inherits) {
        typeidQueue = typeidQueue.concat(newInheritedTemplates.inherits);
      }
    }

    // No matching template, check for Reference as special case (for all Reference types)
    if (TypeIdHelper.isReferenceTypeId(splitTypeID.typeid)) {
      if (splitTypeID.context !== 'single') {
        serializedTypeid = TypeIdHelper.createSerializationTypeId('Reference', splitTypeID.context,
          splitTypeID.isEnum);
      } else {
        serializedTypeid = 'Reference';
      }
      match = rules.best(serializedTypeid);
      if (match) {
        return match;
      }
    }

    // No matching template, check for BaseProperty as special case
    if (splitTypeID.context !== 'single') {
      serializedTypeid = TypeIdHelper.createSerializationTypeId('BaseProperty', splitTypeID.context,
        splitTypeID.isEnum);
    } else {
      serializedTypeid = 'BaseProperty';
    }

    match = rules.best(serializedTypeid);
    if (match) {
      return match;
    }

    // No matching template found returning null.
    return null;
  }

}
