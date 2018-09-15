import * as angular from "angular";
import * as $ from "jquery";

export class MapDetailController implements angular.IController {
    public static $inject = [
        "$scope", "$routeParams", "$location", "mapHelper",
        "markerStyles", "mapDefaults", "dataWrangler", "configService", "mapDetailsSvc"];

    constructor(
        $scope, $routeParams, $location, mapHelper,
        markerStyles, mapDefaults, dataWrangler, configService, mapDetailsSvc) {

        $scope.mapId = $routeParams.mapId;
        $scope.icons = markerStyles.icons;
        $scope.labels = markerStyles.labels;
        $scope.aspectRatios = ["wide", "square", "tall"];
        $scope.pickedLocation = {};
        $scope.config = configService;

        const basemaps = [];
        if ("basemaps" in $scope.config) {
            $scope.basemapNames = $scope.config.basemaps.map((d, i) => d.name);
        }
        if (basemaps[0]) {
            $scope.basemap = basemaps[0].name;
        }

        $scope.map = mapDetailsSvc.get();
        $scope.map.aspectRatio = $scope.map["aspect-ratio"];
        $scope = dataWrangler.setupExisting($scope);

        $scope.$watch(() => {
            // This is a horribly ugly hack, but I am at my wit's end
            const selectedBasemapName = $(".basemap-selector .btn.active").text();

            if ($scope.map) {
                if ((selectedBasemapName !== "") && ($scope.map !== undefined)) {
                    const selectedBasemap = $scope.config.basemaps.filter((basemap) => {
                        return basemap.name === selectedBasemapName;
                    })[0];
                    $scope.map.basemap = selectedBasemap.url;
                    $scope.map.basemapCredit = selectedBasemap.credit;
                } else if (!$scope.map.basemap && $scope.config.basemaps.length) {
                    $scope.map.basemap = $scope.config.basemaps[0].url;
                }
                $scope.map = dataWrangler.onWatch($scope.map);
                $scope.cleanMap = JSON.stringify(dataWrangler.cleanMapObj($scope.map), null, 2);
                $scope.pinpoint = mapHelper.buildPreview($scope.map, changeMap, changeMap, changeMarker);
            }
        });

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

        function changeMap(ev) {
            const newLatLon = ev.target.getCenter();
            const newZoom = ev.target.getZoom();
            $scope.map.latLonString = newLatLon.lat + "," + newLatLon.lng;
            $scope.map.zoom = newZoom;
            $scope.$$childHead.mapform.$setDirty();
            $scope.$apply();

            const dirty = JSON.parse(JSON.stringify($scope.map));
            const clean = dataWrangler.cleanMapObj(dirty);
            mapDetailsSvc.set(clean);
        }

        function changeMarker(ev) {
            const marker = ev.target;
            const newLatLon = marker._latlng;
            $.each($scope.map.markers, (i, m) => {
                if (marker.options.title === i) {
                    $scope.map.markers[i].latLonString = newLatLon.lat + "," + newLatLon.lng;
                }
            });
            $scope.$$childHead.mapform.$setDirty();
            $scope.$apply();
        }

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
