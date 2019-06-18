/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ng from "angular";

export class PreviewLinkDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = (configService) => new PreviewLinkDirective(configService);
        directive.$inject = ["configService"];
        return directive;
    }

    public restrict = "A";
    public replace = false;

    constructor(private configService) {
    }

    public link = ($scope, elm, attrs) => {
        if (!this.configService.previewLink) {
            return $(elm).hide();
        }
        const url = this.configService.previewLink + attrs.slug;
        $(elm).attr("href", url).attr("target", "_blank");
    }
}
