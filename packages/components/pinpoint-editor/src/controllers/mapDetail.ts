/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as angular from "angular";
import * as $ from "jquery";
import { MapDetailsService } from "../services";

export class MapDetailController implements angular.IController {
    public static $inject = [
        "$scope",
        "$routeParams",
        "mapHelper",
        "markerStyles",
        "mapDefaults",
        "dataWrangler",
        "configService",
        "mapDetailsSvc"];

    constructor(
        $scope,
        $routeParams,
        mapHelper,
        markerStyles,
        mapDefaults,
        dataWrangler,
        configService,
        mapDetailsSvc: MapDetailsService) {

        $scope.mapId = $routeParams.mapId;
        $scope.icons = markerStyles.icons;
        $scope.labels = markerStyles.labels;
        $scope.aspectRatios = ["wide", "square", "tall"];
        $scope.directions = markerStyles.directions;

        $scope.map = mapDetailsSvc.details;

        // $scope.map.aspectRatio = $scope.map["aspect-ratio"];

        $scope.$watch("quickstartLatLonString", (val) => {
            if (val) {
                $scope.map.latLonString = val;
                const coords = {
                    lat: val.split(",")[0],
                    lon: val.split(",")[1],
                };
                $scope.addMarker(coords, $scope.quickstartName);

            }
        });

        $scope.$on("$destroy", () => {
            window.onbeforeunload = undefined;
        });

        $scope.removeMarker = (marker) => {
            const index = $scope.map.markers.indexOf(marker);
            if (index > -1) {
                $scope.map.markers.splice(index, 1);
            }
        };

        $scope.addMarker = (center, label) => {
            if ($scope.map.markers.length > 4) {
                return;
            }

            const newMarker = $.extend({}, mapDefaults.marker);
            if ($scope.pinpoint) {
                center = center || $scope.pinpoint.map.getCenter();
                newMarker.lat = center.lat;
                newMarker.lon = center.lng || center.lon;
                newMarker.latLonString = newMarker.lat + "," + newMarker.lon;
            }
            newMarker.text = label || "";
            newMarker.labelDirection = newMarker["label-direction"];
            $scope.map.markers.push(newMarker);
        };
    }
}
