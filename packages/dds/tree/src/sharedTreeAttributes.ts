import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";
import { pkgVersion } from "./packageVersion.js";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @alpha
 * @legacy
 */

export const SharedTreeFactoryType = "https://graph.microsoft.com/types/tree";
/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @alpha
 * @legacy
 */

export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeFactoryType,
	snapshotFormatVersion: "0.0.0",
	packageVersion: pkgVersion,
};
