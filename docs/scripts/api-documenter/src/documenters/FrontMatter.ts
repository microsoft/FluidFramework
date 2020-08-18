import { ApiItemKind } from "@microsoft/api-extractor-model";
import { StringBuilder } from "@microsoft/tsdoc";

export class FrontMatter {
    public title: string;
    public kind: ApiItemKind;
    public package: string;
    public summary?: string;
    public members: Map<string, string[]>

    public toString(): string {
        const str: StringBuilder = new StringBuilder();
        str.append(`title: "${this.title}"\n`);
        str.append(`kind: "${this.kind}"\n`);
        str.append(`package: "${this.package}"\n`);
        if (this.summary) {
            str.append(`summary: "${this.summary}"\n`);
        }
        return str.toString();
    }
}
