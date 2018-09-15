import * as angular from "angular";

export class MapListController implements angular.IController {
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
