import { ApiItem } from '@microsoft/api-extractor-model';
export declare class Utilities {
    private static readonly _badFilenameCharsRegExp;
    /**
     * Generates a concise signature for a function.  Example: "getArea(width, height)"
     */
    static getConciseSignature(apiItem: ApiItem): string;
    /**
     * Converts bad filename characters to underscores.
     */
    static getSafeFilenameForName(name: string): string;
}
//# sourceMappingURL=Utilities.d.ts.map