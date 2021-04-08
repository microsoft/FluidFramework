/**
 * Options to be used with {@link DataBinder.registerOnPath}
 */
export interface IRegisterOnPathOptions {
  /**
   * If true, the callback is executed after the current ChangeSet processing is complete. The default is false.
   */
  isDeferred?: boolean;
}
