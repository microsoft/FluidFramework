/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedOT } from "./ot";
import { pkgVersion } from "./packageVersion";
/**
 * The factory that defines the map
 */
export class OTFactory {
    get type() {
        return OTFactory.Type;
    }
    get attributes() {
        return OTFactory.Attributes;
    }
    /**
     * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
     */
    async load(runtime, id, services, attributes) {
        const ot = new SharedOT(id, runtime, attributes);
        await ot.load(services);
        return ot;
    }
    create(document, id) {
        const ot = new SharedOT(id, document, this.attributes);
        ot.initializeLocal();
        return ot;
    }
}
OTFactory.Type = "https://graph.microsoft.com/types/OT";
OTFactory.Attributes = {
    type: OTFactory.Type,
    snapshotFormatVersion: "0.1",
    packageVersion: pkgVersion,
};
//# sourceMappingURL=factory.js.map