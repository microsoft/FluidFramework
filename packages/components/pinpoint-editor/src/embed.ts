/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPinpointOptions, Pinpoint } from "@kurtb/pinpoint";
import { ISharedMap } from "@prague/map";
import { ComponentDisplayType } from "@prague/runtime-definitions";
import { Document } from "./document";

export class PinpointEmbed {
    private div = document.createElement("div");
    private pinpoint: Pinpoint;
    private dragEnd: any;
    private zoomEnd: any;

    constructor(collabDoc: Document, private rootView: ISharedMap) {
        this.div.style.width = "300px";

        this.dragEnd = (ev) => {
            const center = ev.target.getCenter();
            const current = JSON.parse(rootView.get("map")) as IPinpointOptions;
            current.lat = center.lat;
            current.lon = center.lng;
            rootView.set("map", JSON.stringify(current));
        };

        this.zoomEnd = (ev) => {
            const zoom = ev.target.getZoom();
            const current = JSON.parse(rootView.get("map")) as IPinpointOptions;
            current.zoom = zoom;
            rootView.set("map", JSON.stringify(current));
        };

        const mapDetails = JSON.parse(rootView.get("map")) as IPinpointOptions;
        mapDetails.element = this.div;
        mapDetails.dragend = this.dragEnd;
        mapDetails.zoomend = this.zoomEnd;

        this.pinpoint = new Pinpoint(mapDetails);

        collabDoc.getRoot().on(
            "valueChanged",
            (key, local, op) => {
                // TODO If integrating with a render timing stack need to indicate we need re-render
                this.updatePinpoint();
            });
    }

    public render(mapHost: HTMLElement, displayType: ComponentDisplayType) {
        if (this.div.parentElement !== mapHost) {
            this.div.remove();
            mapHost.appendChild(this.div);
        }

        this.pinpoint.render();
    }

    private updatePinpoint() {
        if (!this.div.parentElement) {
            return;
        }

        const updatedDetails = JSON.parse(this.rootView.get("map"));
        this.pinpoint.remove();
        // The pinpoint controls the aspect ratio itself. Based on the provided width it will compute the
        // height off the aspect ratio. The textual content around the map is not included in this.
        // Given a width and this textual content the height will be fixed. It will need to be recomputed if
        // either change.
        this.div.style.width = "300px";
        updatedDetails.element = this.div;
        updatedDetails.dragend = this.dragEnd;
        updatedDetails.zoomend = this.zoomEnd;
        this.pinpoint = new Pinpoint(updatedDetails);
        this.pinpoint.render();
    }
}
