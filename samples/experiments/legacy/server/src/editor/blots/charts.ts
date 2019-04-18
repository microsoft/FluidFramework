import * as Quill from "quill";
import * as es6Classes from "./es6-classes";

let BlockEmbed = Quill.import("blots/block/embed");

// TODO swap with the Ivy npm package once available
// tslint:disable-next-line:no-string-literal
let Microsoft = window["Microsoft"];

let host = new Microsoft.Charts.Host({ base: "https://charts-prod.trafficmanager.net" });

// tslint:disable:only-arrow-functions
// tslint:disable-next-line:variable-name
export let ChartBlot: any = function (_BlockEmbed3) {
    // tslint:disable-next-line:no-var-keyword no-shadowed-variable
    var ChartBlot: any =  function() {
        es6Classes._classCallCheck(this, ChartBlot);
        return es6Classes._possibleConstructorReturn(this, _BlockEmbed3.apply(this, arguments));
    };
    es6Classes._inherits(ChartBlot, _BlockEmbed3);

    ChartBlot.create = function create(settings) {
        let settingsAsJson = JSON.parse(settings);

        let node = _BlockEmbed3.create.call(this);

        // Create a chart
        let chart = new Microsoft.Charts.Chart(host, node);
        chart.setRenderer(Microsoft.Charts.IvyRenderer.Svg);
        chart.setConfiguration(settingsAsJson);
        node.dataset.chart = chart;
        node.dataset.settings = settings;

        return node;
    };

    ChartBlot.value = function value(node) {
        return node.dataset.settings;
    };

    return ChartBlot;
} (BlockEmbed);
ChartBlot.blotName = "chart";
ChartBlot.tagName = "div";
ChartBlot.className = "chart";
// tslint:enable:only-arrow-functions

export default ChartBlot;
