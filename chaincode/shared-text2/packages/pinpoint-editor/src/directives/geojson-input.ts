import * as ng from "angular";
// tslint:disable-next-line:no-var-requires
const geojsonInput = require("../../partials/geojson-input.html");

export class GeojsonInputDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = (configService) => new GeojsonInputDirective(configService);
        directive.$inject = ["configService"];
        return directive;
    }

    public restrict = "E";
    public template = geojsonInput;
    public scope = {
        geojson: "=?",
    };

    constructor(private configService) {
    }

    public link = ($scope, element, attrs) => {
        // configure styles
        $scope.geojsonStyles = this.configService.geojsonStyles;
        $scope.geojsonStyles.unshift({
            class: "",
            name: "Default",
        });

        // load in existing geojson
        $scope.geojsonRaw = [];
        if ($scope.geojson && $scope.geojson.features.length > 0) {
            for (let i = 0; i < $scope.geojson.features.length; i++) {
                const feature = $scope.geojson.features[i];
                $scope.geojsonRaw[i] = {
                    style: feature.properties.pinpointStyle,
                    valid: true,
                    value: JSON.stringify(feature),
                };
            }
        }
        $scope.geojson = {
            features: [],
            type: "FeatureCollection",
        };

        // add/remove geojsonRaw items
        $scope.removeFeature = (feature) => {
            const index = $scope.geojsonRaw.indexOf(feature);
            if (index > -1) {
                $scope.geojsonRaw.splice(index, 1);
            }
        };
        $scope.addFeature = () => {
            $scope.geojsonRaw.push({
                style: "",
                valid: true,
                value: "",
            });
        };

        // validate geojsonRaw
        // and pass it back to geojson
        $scope.$watch(() => {
            const geojsonRaw = $scope.geojsonRaw;
            for (let i = 0; i < geojsonRaw.length; i++) {
                try {
                    const parsed = JSON.parse(geojsonRaw[i].value);
                    if (!parsed.properties || !parsed.properties.pinpointStyle) {
                        parsed.properties = {
                            pinpointStyle: geojsonRaw[i].style,
                        };
                    } else {
                        parsed.properties.pinpointStyle = geojsonRaw[i].style;
                    }
                    $scope.geojson.features[i] = parsed;
                    geojsonRaw[i].valid = true;
                } catch (err) {
                    geojsonRaw[i].valid = false;
                }
            }
        }); // $scope.$watch
    } // link
}
