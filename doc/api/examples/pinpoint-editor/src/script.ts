import { Pinpoint } from "@kurtb/pinpoint";
import * as angular from "angular";
import * as angularRoute from "angular-route";
import "bootstrap/dist/css/bootstrap.min.css";
import * as $ from "jquery";
import "../style.css";
import * as directives from "./directives";

// tslint:disable:no-var-requires
const mapDetail = require("../partials/map-detail.html");
const mapList = require("../partials/map-list.html");
const config = require("../config.json");
// tslint:enable:no-var-requires

const pinpointTool = angular.module("pinpointTool", [angularRoute]);

pinpointTool.directive("buttonGroup", directives.ButtonGroupDirective.factory);
pinpointTool.directive("geojsonInput", directives.GeojsonInputDirective.factory);
pinpointTool.directive("googlePlaces", directives.GooglePlacesDirective.factory);
pinpointTool.directive("liveLink", directives.LiveLinkDirective.factory());
pinpointTool.directive("mapRoughPreview", directives.MapRoughPreviewDirective.factory());
pinpointTool.directive("previewLink", directives.PreviewLinkDirective.factory());
pinpointTool.directive("publishedCheck", directives.PublishedCheckDirective.factory());
pinpointTool.directive("uniqueSlug", directives.UniqueSlugDirective.factory());

class ConfigService implements angular.IServiceProvider {
    public static factory(): angular.IServiceProviderFactory {
        const directive = () => new ConfigService();
        return directive;
    }

    public options = {};

    public $get = [() => {
        if (!this.options) {
            throw new Error("Config options must be configured");
        }
        return this.options;
    }];

    public config = (opt) => {
        angular.extend(this.options, opt);
    }
}

pinpointTool.provider("configService", ConfigService);

angular.element(document).ready(() => {
    angular.module("pinpointTool").config(["configServiceProvider", (configServiceProvider) => {
        configServiceProvider.config(config);
    }]);

    angular.bootstrap(document, ["pinpointTool"]);
});

pinpointTool.config(["$routeProvider", "$locationProvider",
    ($routeProvider, $locationProvider) => {
        // $locationprovider.html5Mode({ enabled: true, requireBase: false });
        $locationProvider.hashPrefix("");

        $routeProvider.
            when("/maps", {
                controller: "mapListCtrl",
                template: mapList,
            }).
            when("/maps/:mapId", {
                controller: "mapDetailCtrl",
                template: mapDetail,
            }).
            when("/maps/new", {
                controller: "mapDetailCtrl",
                templateUrl: mapDetail,
            }).
            otherwise({
                redirectTo: "/maps",
            });
    }]);

/////////////////
// EDITOR
/////////////////

class MapDetailController implements angular.IController {
    public static $inject = [
        "$scope", "$routeParams", "$http", "$location", "mapHelper",
        "markerStyles", "mapDefaults", "dataWrangler", "configService"];

    constructor(
        $scope, $routeParams, $http, $location, mapHelper, markerStyles, mapDefaults, dataWrangler, configService) {

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

        if ($scope.mapId === "new") {
            $scope.map = $.extend({}, mapDefaults.map);
            $scope.map.aspectRatio = $scope.map["aspect-ratio"];
        } else {
            $http.get("/api/maps/" + $scope.mapId)
                .success((data) => {
                    $scope.map = data;
                    $.extend({}, mapDefaults.map, $scope.map);

                    $scope = dataWrangler.setupExisting($scope);

                })
                .error(() => {
                    $location.path("/maps");
                });
        }

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

        $scope.showPublishModal = () => {
            $scope.publishModal = true;
        };
        $scope.hidePublishModal = () => {
            $scope.publishModal = false;
        };

        $scope.$watch("map.published", (val) => {
            if (val === true) {
                $scope.save();
            }
        });

        function changeMap(ev) {
            const newLatLon = ev.target.getCenter();
            const newZoom = ev.target.getZoom();
            $scope.map.latLonString = newLatLon.lat + "," + newLatLon.lng;
            $scope.map.zoom = newZoom;
            $scope.$$childHead.mapform.$setDirty();
            $scope.$apply();
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
        $scope.$on("$locationChangeStart", (event, next, current) => {
            if ($scope.$$childHead.mapform && !$scope.$$childHead.mapform.$pristine && !$scope.bypassSaveDialog) {
                if (!confirm("Leave page without saving?")) {
                    event.preventDefault();
                }
            }
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

        $scope.save = (valid) => {
            if (valid === false) {
                return;
            }
            $scope.saving = true;
            const dirty = JSON.parse(JSON.stringify($scope.map));
            const clean = dataWrangler.cleanMapObj(dirty);
            if ($scope.map.id && ($scope.map.id !== "new")) {
                // update map
                $http
                    .put("/api/maps/" + $scope.mapId, clean)
                    .success(() => {
                        $scope.saving = false;
                        if ($scope.$$childHead.mapform) {
                            $scope.$$childHead.mapform.$setPristine();
                        }
                    });
            } else {
                // create a new map
                $http
                    .post("/api/maps/", clean)
                    .success((d) => {
                        $scope.map.id = d.id;
                        $scope.saving = false;
                        $location.path("/maps/" + d.id);
                        $scope.$$childHead.mapform.$setPristine();
                    });
            }
            if ($scope.map.published === true) {
                $scope.publish();
            }
        };
        $scope.publish = (valid) => {
            if (valid === false) {
                return;
            }
            const dirty = JSON.parse(JSON.stringify($scope.map));
            const clean = dataWrangler.cleanMapObj(dirty);
            if ($scope.mapId !== "new") {
                clean.id = +$scope.mapId;
            }

            $http
                .post("/api/publish/", clean)
                .success((e, r) => {
                    $scope.$$childHead.mapform.$setPristine();
                    $scope.published = true;
                })
                .error(() => {
                    alert("Not published due to error");
                });
        };
        $scope.delete = () => {
            $scope.deleteModal = true;
        };
        $scope.cancelDelete = () => {
            $scope.deleteModal = false;
        };
        $scope.definitelyDelete = () => {
            if ($scope.map.id && ($scope.map.id !== "new")) {
                // existing map
                $http
                    .delete("/api/maps/" + $scope.map.id)
                    .success((e, r) => {
                        alert("Map deleted");
                        $scope.bypassSaveDialog = true;
                        $location.path("/maps/");
                    })
                    .error(() => {
                        alert("Not deleted due to error");
                        $scope.deleteModal = false;
                    });

            } else {
                $scope.bypassSaveDialog = true;
                $location.path("/maps/");

            }
        };
    }
}

pinpointTool.controller("mapDetailCtrl", MapDetailController);

pinpointTool.factory("mapHelper", [() => {
    let p;
    const build = (opts, dragend, zoomend, markerdragend) => {
        opts.dragend = dragend;
        opts.zoomend = zoomend;
        opts.markerdragend = markerdragend;

        $(".map-outer.inactive").html('<div id="map"></div>');
        if (typeof p !== "undefined") {
            try {
                p.remove();
            } catch (err) {
                //
            }
        }
        opts.creation = true;
        opts.el = ".map-preview";
        if ($(opts.el).length === 1) {
            $(opts.el).attr("class", opts.el.replace(".", "") + " " + opts["aspect-ratio"]);
            p = new Pinpoint(opts);
        }
        return p;
    };
    const splitLatLonString = (str) => {
        if (!str) {
            return [0, 0];
        }
        const lat = +str.replace(/\s/g, "").split(",")[0];
        const lon = +str.replace(/\s/g, "").split(",")[1];
        return [lat, lon];
    };

    return {
        buildPreview: build,
        splitLatLonString,
    };
}]);

pinpointTool.factory("markerStyles", () => {
    const icons = [
        "square",
        "circle",
        "none",
    ];
    const labelsObj = [
        {
            directions: [
                "north",
                "northeast",
                "east",
                "southeast",
                "south",
                "southwest",
                "west",
                "northwest",
            ],
            name: "plain",
        },
        {
            directions: [
                "north",
                "south",
            ],
            name: "callout",
        },
    ];

    const labels = [];
    const labelsDirections = [];
    labelsObj.forEach((l) => {
        labels.push(l.name);
    });
    labelsObj.forEach((l) => {
        labelsDirections[l.name] = l.directions;
    });

    return {
        directions: labelsDirections,
        icons,
        labels,
    };
});

pinpointTool.value("mapDefaults", {
    map: {
        "aspect-ratio": "wide",
        "dek": "",
        "hed": "",
        "lat": 51.5049378,
        "latLonString": "51.5049378, -0.0870377",
        "lon": -0.0870377,
        "markers": [],
        "minimap": false,
        "minimap-zoom-offset": -5,
        "zoom": 4,
    },
    marker: {
        "icon": "square",
        "label-direction": "north",
        "lat": 0,
        "lon": 0,
        "text": "",
    },
});

pinpointTool.factory("dataWrangler", ["mapHelper", "markerStyles", (mapHelper, markerStyles) => {
    const clean = (input) => {
        const output = JSON.parse(JSON.stringify(input));
        const toDelete = [
            "labelDirections",
            "latLonString",
            "el",
            "id",
            "aspectRatio",
            "minimapZoomOffset",
            "labelDirection",
            "creation",
            "creation_date",
            "modification_date",
        ];
        $.each(toDelete, (i, d) => {
            delete output[d];
        });
        $.each(input.markers, (j, marker) => {
            $.each(toDelete, (i, d) => {
                delete output.markers[j][d];
            });
        });
        if (output.geojson && output.geojson.features.length === 0) {
            delete output.geojson;
        }
        if (output.markers.length === 0) {
            delete output.markers;
        }
        return output;
    };
    const setupExisting = (scope) => {
        if (scope.map.lat && scope.map.lon) {
            scope.map.latLonString = scope.map.lat + "," + scope.map.lon;
        } else {
            scope.map.latLonString = "51.5049378,-0.0870377";
        }
        scope.map.minimapZoomOffset = scope.map["minimap-zoom-offset"];
        scope.map.aspectRatio = scope.map["aspect-ratio"];

        if (typeof scope.map.minimapZoomOffset !== "number") {
            scope.map.minimapZoomOffset = -5;
        }

        scope.map.markers = scope.map.markers || [];
        $.each(scope.map.markers, (i, m) => {
            if (m.lat && m.lon) {
                m.latLonString = m.lat + "," + m.lon;
            } else {
                m.latLonString = "51.5049378,-0.0870377";
            }
            m.labelDirections = markerStyles.directions[m.label];
            m["label-direction"] = m["label-direction"] || m.labelDirections[0];
            scope.map.markers[i] = m;
        });

        if (scope.map.basemap && scope.config.basemaps) {
            scope.basemap = scope.config.basemaps.filter((b) => {
                return b.url === scope.map.basemap;
            })[0];
        }

        return scope;

    };
    const watch = (map) => {
        map.zoom = parseInt(map.zoom, 10);
        map.lat = mapHelper.splitLatLonString(map.latLonString)[0];
        map.lon = mapHelper.splitLatLonString(map.latLonString)[1];
        map["minimap-zoom-offset"] = +map.minimapZoomOffset || map["minimap-zoom-offset"];
        map["aspect-ratio"] = map.aspectRatio || map["aspect-ratio"];
        $.each(map.markers, (i, m) => {
            m.labelDirections = markerStyles.directions[m.label];
            m["label-direction"] = m.labelDirection || m["label-direction"];
            m.lat = mapHelper.splitLatLonString(m.latLonString)[0];
            m.lon = mapHelper.splitLatLonString(m.latLonString)[1];
            map.markers[i] = m;
        });

        return map;
    };
    return {
        cleanMapObj: clean,
        onWatch: watch,
        setupExisting,
    };
}]);

/////////////////
// HOMEPAGE
/////////////////

class MapListController implements angular.IController {
    public static $inject = ["$scope", "$http", "$location", "$filter", "$sce", "configService"];

    constructor($scope, $http, $location, $filter, $sce, configService) {
        $scope.config = configService;
        $scope.listView = false;
        $scope.changeView = () => {
            $scope.listView = !$scope.listView;
        };

        $scope.maps = [];
        $scope.allMaps = [];

        // $http.get("/api/maps").success((data) => {
        //     $scope.allMaps = $filter("orderBy")(data, "creation_date", true);
        //     $scope.loadMore();
        // });

        const numberToLoadEachTime = 10;
        $scope.loadMore = () => {
            $scope.maps = $scope.allMaps.slice(0, $scope.maps.length + numberToLoadEachTime);
            $scope.hideLoadMore = ($scope.maps.length === $scope.allMaps.length);
        };

        $scope.previewLink = (map) => {
            // TODO - check to see if this wasn't used
            // let layout: string;
            // if (map["aspect-ratio"] === "wide") {
            //     layout = "offset";
            // } else {
            //     layout = "margin";
            // }
            const url = configService.previewLink + map.slug;
            return url;
        };
        $scope.liveLink = (map, element, attr) => {
            const url = configService.liveLink + attr.slug;
            return url;
        };
    }
}

pinpointTool.controller("mapListCtrl", MapListController);

pinpointTool.filter("html", ($sce) => {
    return (val) => {
        return $sce.trustAsHtml(val);
    };
});
