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

    // private updateMap() {
    //     // This is a horribly ugly hack, but I am at my wit's end
    //     const selectedBasemapName = $(".basemap-selector .btn.active").text();

    //     if (this.$scope.map) {
    //         if ((selectedBasemapName !== "") && (this.$scope.map !== undefined)) {
    //             const selectedBasemap = this.$scope.config.basemaps.filter((basemap) => {
    //                 return basemap.name === selectedBasemapName;
    //             })[0];
    //             this.$scope.map.basemap = selectedBasemap.url;
    //             this.$scope.map.basemapCredit = selectedBasemap.credit;
    //         } else if (!this.$scope.map.basemap && this.$scope.config.basemaps.length) {
    //             this.$scope.map.basemap = this.$scope.config.basemaps[0].url;
    //         }
    //         this.$scope.map = this.dataWrangler.onWatch(this.$scope.map);
    //         this.$scope.cleanMap = JSON.stringify(this.dataWrangler.cleanMapObj(this.$scope.map), null, 2);
    //         this.$scope.pinpoint = this.mapHelper.buildPreview(
    //             this.$scope.map,
    //             this.changeMap.bind(this),
    //             this.changeMap.bind(this),
    //             this.changeMarker.bind(this));
    //     }
    // }

    // private changeMap(ev) {
    //     const newLatLon = ev.target.getCenter();
    //     const newZoom = ev.target.getZoom();
    //     this.$scope.map.latLonString = newLatLon.lat + "," + newLatLon.lng;
    //     this.$scope.map.zoom = newZoom;
    //     this.$scope.$$childHead.mapform.$setDirty();
    //     this.$scope.$apply();

    //     const dirty = JSON.parse(JSON.stringify(this.$scope.map));
    //     const clean = this.dataWrangler.cleanMapObj(dirty);
    //     this.mapDetailsSvc.set(clean);
    // }

    // private changeMarker(ev) {
    //     const marker = ev.target;
    //     const newLatLon = marker._latlng;
    //     $.each(this.$scope.map.markers, (i, m) => {
    //         if (marker.options.title === i) {
    //             this.$scope.map.markers[i].latLonString = newLatLon.lat + "," + newLatLon.lng;
    //         }
    //     });
    //     this.$scope.$$childHead.mapform.$setDirty();
    //     this.$scope.$apply();
    // }
}
