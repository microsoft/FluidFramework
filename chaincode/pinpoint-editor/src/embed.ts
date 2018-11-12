import { IPinpointOptions, Pinpoint } from "@kurtb/pinpoint";
import { IMapView } from "@prague/map";
import { Document } from "./document";

export function embed(mapHost: HTMLElement, collabDoc: Document, rootView: IMapView, platform: any) {
    const innerDiv = document.createElement("div");
    innerDiv.style.width = "300px";
    mapHost.appendChild(innerDiv);

    const dragEnd = (ev) => {
        const center = ev.target.getCenter();
        const current = JSON.parse(rootView.get("map")) as IPinpointOptions;
        current.lat = center.lat;
        current.lon = center.lng;
        rootView.set("map", JSON.stringify(current));
    };

    const zoomEnd = (ev) => {
        const zoom = ev.target.getZoom();
        const current = JSON.parse(rootView.get("map")) as IPinpointOptions;
        current.zoom = zoom;
        rootView.set("map", JSON.stringify(current));
    };

    const mapDetails = JSON.parse(rootView.get("map")) as IPinpointOptions;
    mapDetails.element = innerDiv;
    mapDetails.dragend = dragEnd as any;
    mapDetails.zoomend = zoomEnd as any;

    let pinpoint = new Pinpoint(mapDetails);

    collabDoc.getRoot().on(
        "valueChanged",
        (key, local, op) => {
            const updatedDetails = JSON.parse(rootView.get("map"));
            pinpoint.remove();
            innerDiv.style.width = "300px";
            updatedDetails.element = innerDiv;
            updatedDetails.dragend = dragEnd as any;
            updatedDetails.zoomend = zoomEnd as any;
            pinpoint = new Pinpoint(updatedDetails);
        });

    platform.on("update", () => {
        setTimeout(() => pinpoint.render(), 1);
    });
}
