import { SemverMap } from '../internal/semvermap';
import { getLocalOrRemoteSchema } from './internal_utils';
import { TypeIdHelper } from '@fluid-experimental/property-changeset';

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
class DataBindingRegistry {

  private _applicableBindingCache = new Map<string, any>();
  private _bindingTypeMap = new Map<string, SemverMap>();

  /**
   * Registers a Data Binding.
   *
   * This function allows registering multiple data bindings for the same id. The bindings registered here will later
   * be created in the same order in which they have been registered. The same DataBindingObject may be registered
   * multiple times and there are no checks to prevent this
   *
   * @param {string} bindingType The type of the representation.  (ex. 'VIEW', 'DRAW', 'UI', etc.)
   * @param {string} typeid The id to use for this registration, usually the type id of the objects being represented
   *                    (like a PropertySet template id).
   * @param {UpgradeType} upgradeType what semver range this data binding applies to.
   * @param {Object} dataBindingObject The Data Binding and its associated metadata.
   * @public
   */
  public register(bindingType, typeid, upgradeType, dataBindingObject) {
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
   * @param {string} bindingType   - The type of the representation.
   * @param {string} typeid       - The registration id.
   * @return {boolean} True if the representation was successfully removed
   * @public
   */
  public unregister(bindingType, typeid) {
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
   * @param {string} bindingType The type of the representation.
   * @param {string} typeid The registration id.
   * @return {boolean} true if there is a precise rule for this bindingtype/typeid pair
   * @public
   */
  public has(bindingType, typeid) {
    const rules = this._bindingTypeMap.get(bindingType);
    if (!rules) {
      return false;
    }
    return rules.has(typeid);
  }

  /**
   * Return all the bindings that apply to this type
   *
   * @param {String} in_typeId - the type for which we want binding definitions
   * @param {string} [in_requestedBindingType] - a specific binding type to filter for, all are returned if no type
   *   provided
   * @param {Workspace} [in_workspace] - the current workspace, if present
   *
   * @return {Array.<Object>} array of applicable bindings
   *
   * @private
   */
  public getApplicableBindingDefinitions(in_typeId, in_requestedBindingType, in_workspace) {
    const key = in_typeId + '.' + in_requestedBindingType; // in_requestedBindingType may be undefined; it's ok
    let lookup = this._applicableBindingCache[key];
    if (!lookup) {
      // Check if the typeID is registered or if a parent typeID is.
      const applicableBindings: any[] = [];
      this._bindingTypeMap.forEach((rules, bindingType) => {
        if (!in_requestedBindingType || bindingType === in_requestedBindingType) {
          try {
            const definition = this.getRegisteredDefinition(in_typeId, bindingType, in_workspace);
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
   * @param {string} in_typeid - The typeid of the property to query for
   * @param {string} in_bindingType - The registered DataBinding must have this binding type to be considered.
   * @param {Workspace} [in_workspace] - the current workspace, if present
   * @return {Object|null} The definition a registered template or null if no template is found.
   */
  public getRegisteredDefinition(in_typeid, in_bindingType, in_workspace) {
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
      const currentTypeid = typeidQueue.shift();
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
        getLocalOrRemoteSchema(currentTypeid, in_workspace);
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

export { DataBindingRegistry };
