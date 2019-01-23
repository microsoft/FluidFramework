import * as ng from "angular";

export class LiveLinkDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = ($http, configService) => new LiveLinkDirective($http, configService);
        directive.$inject = ["$http", "configService"];
        return directive;
    }

    public replace = false;
    public restrict = "A";
    public scope = {
        published: "=?",
    };

    constructor(private $http, private configService) {
    }

    public link = ($scope, elm, attrs) => {
        function disable() {
            $(elm).attr("disabled", "true");
            $(elm).text("Unpublished");
        }
        function enable() {
            $(elm).attr("disabled", "false");
            $(elm).text("Live link");
        }
        const url = this.configService.liveLink + attrs.slug;
        $(elm).attr("href", url).attr("target", "_blank");
        if (this.configService.s3url) {
            const ajaxUrl = this.configService.s3url + attrs.slug + ".json";
            this.$http.get(ajaxUrl).error(disable);
        } else {
            enable();
        }
        $scope.$watch(() => {
            if ($scope.published === true) {
                enable();
            }
        });
    }
}
