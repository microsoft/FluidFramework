/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ng from "angular";

export class PublishedCheckDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = ($http, configService) => new PublishedCheckDirective($http, configService);
        directive.$inject = ["$http", "configService"];
        return directive;
    }

    public restrict = "A";
    public replace = false;

    constructor(private $http, private configService) {
    }

    public link = ($scope, elm, attrs) => {
        function disable() {
            $(elm).html("unpublished");
        }
        function enable() {
            $(elm)
                .html('<span class="glyphicon glyphicon-ok" aria-hidden="true"></span> published')
                .removeClass("label-default")
                .addClass("label-primary");
        }
        if (this.configService.s3url) {
            const ajaxUrl = this.configService.s3url + attrs.slug + ".json";
            this.$http.get(ajaxUrl).success(enable).error(disable);
        } else {
            enable();
        }
    }
}
