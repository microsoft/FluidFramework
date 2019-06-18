/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ng from "angular";
import * as L from "leaflet";

export class MapRoughPreviewDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = (configService) => new MapRoughPreviewDirective(configService);
        directive.$inject = ["configService"];
        return directive;
    }

    public restrict = "E";
    public replace = false;
    public template = '<div class="prevmap"></div>';

    constructor(private configService) {
    }

    public link = ($scope, elm, attrs) => {
        const mapOptions = {
            attributionControl: false,
            keyboard: false,
            scrollWheelZoom: false,
            zoomControl: false,
        };
        const mapEl = $(elm).find(".prevmap")[0];
        const map = L.map(mapEl, mapOptions)
            .setView([attrs.lat, attrs.lon], attrs.zoom - 1);

        let basemap = attrs.basemap;
        if (!basemap && (this.configService.basemaps.length > 0)) {
            basemap = $scope.config.basemaps[0].url;
        } else if (!basemap) {
            basemap = "http://{s}.tile.osm.org/{z}/{x}/{y}.png";
        }

        L.tileLayer(basemap).addTo(map);
    }
}
