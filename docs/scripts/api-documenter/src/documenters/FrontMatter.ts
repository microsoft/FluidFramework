import { ApiItemKind } from "@microsoft/api-extractor-model";
import { StringBuilder } from "@microsoft/tsdoc";

export class FrontMatter {
    public title: string;
    public kind: ApiItemKind;
    public package: string;
    public metadata?: string;

    public toString(): string {
        const str: StringBuilder = new StringBuilder();
        str.append("---\n");
        str.append(`title: "${this.title}"\n`);
        str.append(`kind: "${this.kind}"\n`);
        str.append(`package: "${this.package}"\n`);
        if (this.metadata) {
            str.append(`metadata: "${this.metadata}"\n`);
        }
        str.append("---\n");
        return str.toString();
    }
}
