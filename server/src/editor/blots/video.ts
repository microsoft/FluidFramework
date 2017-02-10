import * as Quill from "quill";
import * as es6Classes from "./es6-classes";

let BlockEmbed = Quill.import("blots/block/embed");

// tslint:disable:only-arrow-functions
// tslint:disable-next-line:variable-name
let VideoBlot: any = function (_BlockEmbed3) {
    // tslint:disable-next-line:no-var-keyword no-shadowed-variable
    var VideoBlot: any =  function() {
        es6Classes._classCallCheck(this, VideoBlot);
        return es6Classes._possibleConstructorReturn(this, _BlockEmbed3.apply(this, arguments));
    };
    es6Classes._inherits(VideoBlot, _BlockEmbed3);

    VideoBlot.create = function create(url) {
        let node = _BlockEmbed3.create.call(this);
        node.setAttribute("src", url);
        node.setAttribute("frameborder", "0");
        node.setAttribute("allowfullscreen", true);
        return node;
    };

    VideoBlot.formats = function formats(node) {
        let format: any = {};
        if (node.hasAttribute("height")) {
            format.height = node.getAttribute("height");
        }
        if (node.hasAttribute("width")) {
            format.width = node.getAttribute("width");
        }
        return format;
    };

    VideoBlot.value = function value(node) {
        return node.getAttribute("src");
    };

    VideoBlot.prototype.format = function format(name, value) {
        if (name === "height" || name === "width") {
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
VideoBlot.blotName = "video";
VideoBlot.tagName = "iframe";
// tslint:enable:only-arrow-functions

export default VideoBlot;
