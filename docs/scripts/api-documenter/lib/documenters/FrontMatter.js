"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tsdoc_1 = require("@microsoft/tsdoc");
class FrontMatter {
    toString() {
        const str = new tsdoc_1.StringBuilder();
        str.append("---\n");
        str.append(`title: "${this.title}"\n`);
        str.append(`kind: "${this.kind}"\n`);
        str.append(`package: "${this.package}"\n`);
        str.append("---\n");
        return str.toString();
    }
}
exports.FrontMatter = FrontMatter;
//# sourceMappingURL=FrontMatter.js.map