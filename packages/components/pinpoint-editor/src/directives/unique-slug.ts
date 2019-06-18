/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ng from "angular";

export class UniqueSlugDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = ($http) => new UniqueSlugDirective($http);
        directive.$inject = ["$http"];
        return directive;
    }

    public restrict = "A";
    public require = "ngModel";

    constructor($http) {
        //
    }

    public link = ($scope, element, attrs, ngModel) => {
        if ($scope.state === "update") { return; }

        function validate(value) {
            if ($scope.slug === "") {
                ngModel.$setValidity("unique", false);
            }
            if ($scope.map.id || ($scope.slug && $scope.slug.indexOf(ngModel.$viewValue) === -1)) {
                ngModel.$setValidity("unique", true);
            } else {
                ngModel.$setValidity("unique", false);
            }
        }

        // this.$http.get("/api/slugs").success((slugs) => {
        //     $scope.slug = slugs;
        //     validate(ngModel.$viewValue);
        // });

        $scope.$watch(() => {
            return ngModel.$viewValue;
        }, validate);
    }
}
