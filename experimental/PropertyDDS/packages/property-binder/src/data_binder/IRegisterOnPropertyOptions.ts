/**
 * Options to be used with {@link DataBinding.registerOnProperty}
 */
export interface IRegisterOnPropertyOptions {
  /**
   *  If true the callback will only be called if the corresponding Property exists, i.e. it won't be called for
   *  'remove' events. The default is false.
   */
  requireProperty?: boolean;

  /**
   * If true, the callback is executed after the current ChangeSet processing is complete. The default is false.
   */
  isDeferred?: boolean;
}
