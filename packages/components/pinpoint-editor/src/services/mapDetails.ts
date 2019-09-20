/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMarker, IPinpointOptions } from "@kurtb/pinpoint";
import { ISharedMap } from "@microsoft/fluid-map";
import * as angular from "angular";

export class MapDetailsService {
    public details: IPinpointOptions;
    private sequenceNumber: number;

    constructor(private $rootScope: angular.IRootScopeService, map: ISharedMap, view: ISharedMap) {
        this.details = JSON.parse(view.get("map"));

        $rootScope.$watch(
            () => ({ details: this.details, sequenceNumber: this.sequenceNumber }),
            (newValue, oldValue) => {
                // Bit of a hack to make angular data binding work easier with Fluid - especially when dealing with
                // a single JSON object in a map key.
                // If the remote SN for the old and new values differ then we are merging both remote and local changes.
                // We wait for the remote changes to stabalize before sending our new change.
                if (newValue.sequenceNumber !== oldValue.sequenceNumber) {
                    return;
                }

                if (!angular.equals(newValue.details, view.get("map"))) {
                    view.set("map", JSON.stringify(newValue.details));
                }
            },
            true);

        map.on(
            "valueChanged",
            (key, local, op) => {
                if (local) {
                    return;
                }

                const updated = JSON.parse(view.get("map"));
                angular.extend(this.details, updated);
                this.sequenceNumber = op.sequenceNumber;
                this.$rootScope.$apply();
            });
    }

    public addMarker(marker: IMarker) {
        this.details.markers.push(marker);
        this.$rootScope.$apply();
    }
}
