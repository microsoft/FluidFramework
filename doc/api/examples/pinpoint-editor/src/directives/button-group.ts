import * as ng from "angular";

export class ButtonGroupDirective implements ng.IDirective {
    public static factory(): ng.IDirectiveFactory {
        const directive = () => new ButtonGroupDirective();
        return directive;
    }

    public replace = true;
    public restrict = "E";
    // transclude:true,
    public scope = {
        labels: "=?",
        options: "=",
        value: "=",
    };
    public template: '<div class="btn-group"></div>';
    public link = ($scope, elm, attrs) => {
        const $elm = $(elm);
        $.each($scope.options, (i, o) => {
            let label;
            if ($scope.labels && $scope.labels[i]) {
                label = $scope.labels[i];
            } else {
                label = o;
            }
            $elm.append(
                `<button type="button" data-val="` + o + `" class="btn btn-default">` + label + "</button>");
        });
        $elm.find('.btn[data-val="' + $scope.value + '"]').addClass("active");
        $elm.find(".btn").click(() => {
            const $this = $(this);
            $elm.find(".btn").removeClass("active");
            $this.addClass("active");
            const val = $this.attr("data-val");
            $scope.value = val;
            $scope.$apply();
            setTimeout(() => {
                $scope.$apply();
            }, 50);
        });
    }
}
