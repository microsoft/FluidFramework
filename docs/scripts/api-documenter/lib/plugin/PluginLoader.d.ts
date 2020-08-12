import { MarkdownDocumenterFeature, MarkdownDocumenterFeatureContext } from './MarkdownDocumenterFeature';
import { DocumenterConfig } from '../documenters/DocumenterConfig';
export declare class PluginLoader {
    markdownDocumenterFeature: MarkdownDocumenterFeature | undefined;
    load(documenterConfig: DocumenterConfig, createContext: () => MarkdownDocumenterFeatureContext): void;
}
//# sourceMappingURL=PluginLoader.d.ts.map