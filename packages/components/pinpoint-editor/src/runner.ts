/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Pinpoint } from "@kurtb/pinpoint";
import {
    IComponent,
    IComponentHTMLOptions,
    IComponentHTMLVisual,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentLayout } from "@microsoft/fluid-framework-interfaces";
import { ISharedMap } from "@microsoft/fluid-map";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import * as angular from "angular";
import * as angularRoute from "angular-route";
// tslint:disable-next-line:no-submodule-imports
import "bootstrap/dist/css/bootstrap.min.css";
import { EventEmitter } from "events";
import * as $ from "jquery";
import "../style.css";
import { MapDetailController, MapListController } from "./controllers";
import * as directives from "./directives";
import { Document } from "./document";
import { PinpointEmbed } from "./embed";
import { MapDetailsService } from "./services";

// tslint:disable:no-var-requires
const GoogleMapsLoader = require("google-maps");
const mapDetail = require("../partials/map-detail.html");
const mapList = require("../partials/map-list.html");
const config = require("../config.json");
// tslint:enable:no-var-requires

GoogleMapsLoader.KEY = config.googleMapsAPIKey;
GoogleMapsLoader.LIBRARIES = ["places"];

const pinpointTool = angular.module("pinpointTool", [angularRoute]);

pinpointTool.directive("buttonGroup", directives.ButtonGroupDirective.factory());
pinpointTool.directive("geojsonInput", directives.GeojsonInputDirective.factory());
pinpointTool.directive("googlePlaces", directives.GooglePlacesDirective.factory());
pinpointTool.directive("liveLink", directives.LiveLinkDirective.factory());
pinpointTool.directive("mapRoughPreview", directives.MapRoughPreviewDirective.factory());
pinpointTool.directive("previewLink", directives.PreviewLinkDirective.factory());
pinpointTool.directive("publishedCheck", directives.PublishedCheckDirective.factory());
pinpointTool.directive("uniqueSlug", directives.UniqueSlugDirective.factory());
pinpointTool.directive("pinpointMap", directives.PinpointMapDirective.factory());

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
                redirectTo: "/maps/new",
            });
    }]);

/////////////////
// EDITOR
/////////////////

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
            console.log(`Building pinpoint ${opts.lat} ${opts.lon}`);
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

pinpointTool.controller("mapListCtrl", MapListController);

pinpointTool.filter("html", ($sce) => {
    return (val) => {
        return $sce.trustAsHtml(val);
    };
});

export class PinpointRunner extends EventEmitter implements
    IComponentLoadable, IComponentHTMLVisual, IComponentLoadable, IComponentLayout {

    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<PinpointRunner> {
        const runner = new PinpointRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    public get IComponentHTMLVisual() { return this; }
    public get IComponentLoadable() { return this; }
    public get IComponentLayout() { return this; }

    public get url(): string {
        return this.runtime.id;
    }

    // Aspect ratio of the map may change - "wide", "square", "tall" are what pinpoint defines
    public aspectRatio?: number;
    public minimumWidth?: number;
    public minimumHeight?: number;
    public readonly variableHeight = true;
    public readonly canInline = true;
    public readonly preferInline = false;

    private collabDoc: Document;
    private rootView: ISharedMap;
    private editor: boolean = false;
    private embed: PinpointEmbed;

    constructor(private runtime: IComponentRuntime, private context: IComponentContext) {
        super();
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        if (!this.embed) {
            this.embed = new PinpointEmbed(this.collabDoc, this.rootView);
        }

        const display = options && options.display ? options.display : "block";
        this.editor = elm.id === "content";

        if (this.editor) {
            elm.innerHTML = "<div ng-view></div>";

            pinpointTool.factory("mapDetailsSvc", ["$rootScope", ($rootScope) => {
                return new MapDetailsService($rootScope, this.collabDoc.getRoot(), this.rootView);
            }]);

            angular.element(document).ready(() => {
                angular.module("pinpointTool").config(["configServiceProvider", (configServiceProvider) => {
                    configServiceProvider.config(config);
                }]);

                angular.bootstrap(document, ["pinpointTool"]);
            });
        } else {
            this.embed.render(elm, display);
        }
    }

    private async initialize(): Promise<void> {
        this.collabDoc = await Document.load(this.runtime);
        this.rootView = await this.collabDoc.getRoot();
        await new Promise<void>((resolve) => {
            GoogleMapsLoader.KEY = this.getMapAPIKey();
            GoogleMapsLoader.load((google) => {
                pinpointTool.value("google", google);
                resolve();
            });
        });

        // Add in the text string if it doesn't yet exist
        if (!this.collabDoc.existing) {
            const data = {
                "aspect-ratio": "tall",
                "dek": "This is a test map.",
                "hed": "The U.K. and France",
                "lat": 51.5049378,
                "lon": - 0.0870377,
                "markers": [{
                    "icon": "square",
                    "label": "plain",
                    "label-direction": "north",
                    "labelDirection": "north",
                    "lat": 51.5049378,
                    "lon": - 0.0870377,
                    "text": "",
                }],
                "minimap": true,
                "minimap-zoom-offset": -5,
                "note": "This is a note.",
                "zoom": 4,
            };
            this.rootView.set("map", JSON.stringify(data));
        } else {
            await this.rootView.wait("map");
        }
    }

    private getMapAPIKey() {
        const hostTokens = (this.context.hostRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence ? hostTokens.intelligence.pinpointEditor : undefined;
        if (intelTokens === undefined || intelTokens.key === undefined) {
            return undefined;
        } else {
            return intelTokens.key;
        }
    }
}
