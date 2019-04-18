import { IPinpointOptions, Pinpoint } from "@kurtb/pinpoint";
import * as ng from "angular";

export class PinpointMapDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = () => new PinpointMapDirective();
        return directive;
    }

    public restrict = "E";
    public replace = false;
    public template = "<div>Hello</div>";
    public scope = {
        map: "=",
    };

    private pinpoint: Pinpoint;

    public link = ($scope, elm, attrs) => {
        $scope.$watch(
            "map",
            (newMap) => {
                this.renderPinpoint($scope, elm);
            },
            true);

        this.renderPinpoint($scope, elm);
    }

    private renderPinpoint($scope, elm) {
        const dragend = (ev) => {
            const center = ev.target.getCenter();
            $scope.map.lat = center.lat;
            $scope.map.lon = center.lng;
            $scope.$apply();
        };

        const zoomend = (ev) => {
            const zoom = ev.target.getZoom();
            $scope.map.zoom = zoom;
            $scope.$apply();
        };

        const copy = ng.copy($scope.map) as IPinpointOptions;
        copy.element = elm[0];
        copy.dragend = dragend as () => void;
        copy.zoomend = zoomend as () => void;

        if (this.pinpoint) {
            this.pinpoint.remove();
        }

        this.pinpoint = new Pinpoint(copy);
        // (elm[0] as HTMLDivElement).classList.add(copy["aspect-ratio"]);
    }
}
