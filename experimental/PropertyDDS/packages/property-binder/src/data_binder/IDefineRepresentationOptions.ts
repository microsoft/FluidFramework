
import { BaseProperty } from '@fluid-experimental/property-properties';
import { UpgradeType } from '../internal/semvermap';

export type representationGenerator =
/**
 * Callback signature for generating a runtime representation for a property. A runtime representation is an
 * arbitrary class (no inheritance requirements are imposed on your representation) that represents
 * a given property in your application. A {@link DataBinder.DataBinding} is then used to update the runtime
 * representation when the corresponding property changes.
 *
 * The generator is registered using {@link DataBinder.defineRepresentation}, and is called lazily
 * whenever {@link DataBinder.getRuntimeRepresentation} is called for the registered property/bindingType
 * pair.
 *
 * @param property - The property for which we are creating a new runtime representation.
 * @param bindingType - The binding type that the runtime representation is being created for. If multiple
 *   defineRepresentations are done with the same generator function, this can vary.
 * @param userData - The userData provided to {@link DataBinder.defineRepresentation} when the runtime representation
 *   was first defined.
 * @return The runtime representation for this object. There is no form imposed on this object.
 *
 * @public
 */
(property: BaseProperty, bindingType: string, userData?: any) => any;

export type representationInitializer =
/**
 * Callback signature for finalizing a runtime representation for a property, used with
 * {@link DataBinder.defineRepresentation}.
 *
 * There are situations where an object cannot be created in a single step due to dependencies on other
 * objects. In this case, the second stage of initialization can be moved to the representationInitializer.
 * See {@link DataBinder.defineRepresentation} for more details.
 *
 * @param runtimeObject - The runtimeObject that was previously created by a generator function, registered in
 *   the same call with {@link DataBinder.defineRepresentation}
 * @param property - The property the runtime representation was associated with.
 * @param bindingType - The binding type that the runtime representation is being created for. If multiple
 *   defineRepresentations are done with the same generator function, this can vary.
 * @param userData - The userData provided to {@link DataBinder.defineRepresentation} when the runtime representation
 *   was first defined.
 *
 * @public
 */
(runtimeObject: any, property: BaseProperty, bindingType: string, userData?: any) => void;

export type representationDestroyer =
/**
 * Callback signature for destroying a runtime representation associated with a property, used
 * with {@link DataBinder.defineRepresentation}. It will be called when the corresponding property
 * is destroyed or the runtime representation is unregistered.
 *
 * @param runtimeObject - The runtimeObject that was previously created by a generator function, registered in
 *   the same call with {@link DataBinder.defineRepresentation}.
 * @param bindingType - The binding type that the runtime representation was created for.
 * @param userData - The userData provided to {@link DataBinder.defineRepresentation} when the runtime representation
 *   was first defined.
 *
 * @public
 */
(runtimeObject: any, bindingType: string, userData?: any) => void;

/**
 * Options for {@link DataBinder.defineRepresentation}
 */
export interface IDefineRepresentationOptions {
  /**
   * Optional callback called immediately after the generator result is added to the databinder.
   * This permits a runtime representation to be initialized in two stages in cases where it is
   * dependent on other runtime representations.
   */
  initializer?: representationInitializer;

  /**
   * Optional callback to clean up a runtime object as it is being
   * removed from the DataBinder, due to the property being destroyed, or unregistering of the
   * runtime representation.
   *
   * After this function is called, the runtime representation is no longer known by the DataBinder, but there are
   * no guarantees that the instance is not in use in another system - it is the application's responsibility to
   * unregister them.
   */
  destroyer?: representationDestroyer;

  /**
   * Optional userdata to be provided to the generator, initializer and destroyer functions. There is no
   * form imposed on this structure.
   */
  userData?: any;

  /**
   * Optional value to specify what schemas the representation will apply to, based on the semver of the rule,
   * and the semver of the property being applied to.
   *
   * If the UpgradeType is MINOR, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0, < 2.0.0
   *
   * If the UpgradeType is MAJOR, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0.
   *
   * If the UpgradeType is PATCH, with a semver of 1.1.0, it will apply to any props with versions >= 1.1.0 but < 1.2.0
   *
   * If there is a rep X with MINOR UpgradeType for 1.1.0, and a rep Y with PATCH for 1.1.1, X will apply to all
   * props with versions >= 1.1.0, _except_ for props with versions >= 1.1.1 but < 1.2.0, which will have rep Y.
   */
  upgradeType?: UpgradeType;
}
