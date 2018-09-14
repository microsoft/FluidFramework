import * as ng from "angular";
import { google as GoogleMaps } from "google-maps";

export class GooglePlacesDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = (google: GoogleMaps) => new GooglePlacesDirective(google);
        directive.$inject = ["google"];
        return directive;
    }

    public replace = true;
    public restrict = "E";
    // transclude:true,
    public scope = {
        location: "=",
        locationName: "=?",
        placeholder: "@",
    };

    // tslint:disable-next-line:max-line-length
    public template = `<input id="google_places_ac" name="google_places_ac" type="text" class="form-control search-form" placeholder="" />`;

    constructor(private google: GoogleMaps) {
    }

    public link = ($scope, elm, attrs) => {
        const autocomplete = new this.google.maps.places.Autocomplete(elm[0], {});
        this.google.maps.event.addListener(autocomplete, "place_changed", () => {
            const place = autocomplete.getPlace();
            $scope.location = place.geometry.location.lat() + "," + place.geometry.location.lng();
            $scope.locationName = place.name;
            $scope.$apply();
            elm.val(""); // clear text
        });
    }
}
