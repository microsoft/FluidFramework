import * as $ from 'jquery';
var Quill = require('quill');
var sharedb = require('sharedb/lib/client');
var richText = require('rich-text');

// Register the use of the rich text OT format
sharedb.types.register(richText.type);

// Open WebSocket connection to ShareDB server
var socket = new WebSocket('ws://' + window.location.host);
var connection = new sharedb.Connection(socket);

// For testing reconnection
(<any> window).disconnect = function () {
    connection.close();
};

(<any> window).connect = function () {
    var socket = new WebSocket('ws://' + window.location.host);
    connection.bindToSocket(socket);
};

// One of the sample Quill modules as an example of a custom plugin
Quill.register('modules/counter', (quill, options) => {
    var container = document.querySelector(options.container);
    quill.on('text-change', (delta, oldContents, source: String) => {
        var text = quill.getText();
        
        // There are a couple issues with counting words
        // this way but we'll fix these later
        container.innerHTML = text.split(/\s+/).length;        
    });
});

let BlockEmbed = Quill.import('blots/block/embed');

// TODO - Quill assumes es6 and a webpack environment. I'm assuming TypeScript + Browserify. I'm not sure
// yet how to extend an es6 class, defined as a variable (the Quill.import above), inside of TypeScript. So
// cheating a bit for now and just using the babel output.
function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
        throw new TypeError('Cannot call a class as a function');
    }
}
function _possibleConstructorReturn(self, call) {
    if (!self) {
        throw new ReferenceError('this hasn\'t been initialised - super() hasn\'t been called');
    }
    return call && (typeof call === 'object' || typeof call === 'function') ? call : self;
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== 'function' && superClass !== null) {
        throw new TypeError('Super expression must either be null or a function, not ' + typeof superClass);
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            enumerable: false,
            writable: true,
            configurable: true
        }
    });
    if (superClass)
        Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
}

let VideoBlot: any = function (_BlockEmbed3) {        
    var VideoBlot: any =  function() {
        _classCallCheck(this, VideoBlot);
        return _possibleConstructorReturn(this, _BlockEmbed3.apply(this, arguments));
    }
    _inherits(VideoBlot, _BlockEmbed3);

    VideoBlot.create = function create(url) {
        var node = _BlockEmbed3.create.call(this);
        node.setAttribute('src', url);
        node.setAttribute('frameborder', '0');
        node.setAttribute('allowfullscreen', true);
        return node;
    };

    VideoBlot.formats = function formats(node) {
        var format: any = {};
        if (node.hasAttribute('height')) {
            format.height = node.getAttribute('height');
        }
        if (node.hasAttribute('width')) {
            format.width = node.getAttribute('width');
        }
        return format;
    };

    VideoBlot.value = function value(node) {
        return node.getAttribute('src');
    };

    VideoBlot.prototype.format = function format(name, value) {
        if (name === 'height' || name === 'width') {
            if (value) {
                this.domNode.setAttribute(name, value);
            } else {
                this.domNode.removeAttribute(name, value);
            }
        } else {
            _BlockEmbed3.prototype.format.call(this, name, value);
        }
    };
    return VideoBlot;
} (BlockEmbed);
VideoBlot.blotName = 'video';
VideoBlot.tagName = 'iframe';

// Initialize the API
var host = new window['ivy'].Host({
	base: 'https://edera.cloudapp.net',
    secret: "IvyBearerToken"
});

let ChartBlot: any = function (_BlockEmbed3) {        
    var ChartBlot: any =  function() {
        _classCallCheck(this, ChartBlot);
        return _possibleConstructorReturn(this, _BlockEmbed3.apply(this, arguments));
    }
    _inherits(ChartBlot, _BlockEmbed3);

    ChartBlot.create = function create(settings) {
        let settingsAsJson = JSON.parse(settings);

        var node = _BlockEmbed3.create.call(this);
                
        // Create a chart
        var chart = new window['ivy'].IvyChart(host, node);
        chart.setRenderer(1);
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
ChartBlot.blotName = 'chart';
ChartBlot.tagName = 'div';
ChartBlot.className = 'chart';

Quill.register(BlockEmbed);
Quill.register(VideoBlot);
Quill.register(ChartBlot);

export function connect(id: string, sync: boolean) {
    let doc = connection.get('documents', id);    
    doc.subscribe((err) => {        
        if (err) {
            throw err;
        }

        // If there is no type we need to create the document
        if (!doc.type) {
            doc.create([], 'rich-text');
        }

        // create the editor
        let quill = new Quill('#editor', { 
            modules: {
                toolbar: '#toolbar',
                counter: {
                    container: '#counter'
                }
            },
            theme: 'snow'
        });

        // Set the contents and populate events
        quill.setContents(doc.data);
        quill.on('text-change', function (delta, oldDelta, source) {
            if (source !== 'user') return;
            doc.submitOp(delta, { source: quill });
        });
        doc.on('op', function (op, source) {
            if (source === quill) return;
            quill.updateContents(op);
        });        

        // Bind the custom buttons
        $('#video-button').click(() => {
            let range = quill.getSelection(true);
            quill.insertText(range.index, '\n', Quill.sources.USER);
            let url = 'https://www.youtube.com/embed/QHH3iSeDBLo?showinfo=0';
            quill.insertEmbed(range.index + 1, 'video', url, Quill.sources.USER);
            // quill.formatText(range.index + 1, 1, { height: '170', width: '400' });
            quill.setSelection(range.index + 2, Quill.sources.SILENT);
        });

        $('#chart-button').click(() => {
            let range = quill.getSelection(true);
            quill.insertText(range.index, '\n', Quill.sources.USER);
            let chartDef = {
                "hasChartTitle": true,
                "chartTitleText": "Chart Title",
                "chartTitleEdge": 1,
                "chartTitlePosition": 1,
                "hasLegend": true,
                "hasLegendTitle": true,
                "legendTitleText": "Legend",
                "legendTitleEdge": 1,
                "legendTitleEdgePosition": 1,
                "legendEdge": 1,
                "legendPosition": 1,
                "numDataPoints": 10,
                "seriesLayout": 0,
                "seriesData": [{
                    "id": "i0",
                    "title": "Series 1",
                    "data": {
                    "2": [28.90542477336814, 47.96023343271161, 66.20821209478959, 31.586201681367037, 42.353363654697574, 44.9377860637673, 37.0187548405804, 99.40313031303944, 46.128627123887746, 38.89247221424439]
                    },
                    "layout": "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58"
                }, {
                    "id": "i1",
                    "title": "Series 2",
                    "data": {
                    "2": [94.72913125049618, 30.001128509353737, 36.7456928705214, 33.8969942653699, 59.17199006926743, 51.19145395109292, 34.95964640380736, 52.930325138593844, 52.02741092101171, 63.200190486346386]
                    },
                    "layout": "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58"
                }, {
                    "id": "i2",
                    "title": "Series 3",
                    "data": {
                    "2": [32.87199015776532, 29.503783579713023, 49.072543238145684, 77.7697683987071, 66.55250409944145, 43.255317066864755, 37.8755636471737, 3.38896612476708, 30.83535302110479, 10.03046388086483]
                    },
                    "layout": "Area Stacked (100%)|310E5127-9664-483E-B00D-43661237ED58"
                }],
                "width": 400,
                "height": 350,
                "hasDataLabels": false
                };

            quill.insertEmbed(range.index + 1, 'chart', JSON.stringify(chartDef), Quill.sources.USER);
            // quill.formatText(range.index + 1, 1, { height: '170', width: '400' });
            quill.setSelection(range.index + 2, Quill.sources.SILENT);
        });        
    });                        
}