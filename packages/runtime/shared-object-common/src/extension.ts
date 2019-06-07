import { IChaincodeModule } from "@prague/runtime-definitions";

/**
 * Definitions of a shared extensions. Extensions follow a common model but enable custom behavior.
 */
export interface ISharedObjectExtension extends IChaincodeModule {
    /**
     * String representing the type of the extension.
     */
    type: string;

    /**
     * String representing the version of the snapshot. This value is updated when the format of snapshots changes.
     */
    readonly snapshotFormatVersion: string;
}
