import { IChaincodeModule } from "@prague/runtime-definitions";

export interface IExtension {
    /**
     * String representing the type of the extension.
     */
    type: string;
}
/**
 * Definitions of a shared extensions. Extensions follow a common model but enable custom behavior.
 */
export interface ISharedObjectExtension extends IChaincodeModule, IExtension {
    readonly snapshotFormatVersion: string;
}
