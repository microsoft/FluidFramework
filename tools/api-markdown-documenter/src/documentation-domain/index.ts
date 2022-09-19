import {Node} from 'unist';
import {paragraph} from 'mdast';

export enum DocumentNodeKind {
    Document = "Document",
    NestedSection = "NestedSection",
}

export interface DocumentNode extends Node<DocumentNode[]> {
    readonly type: DocumentNodeKind;
}

export class Document implements DocumentNode {
    public readonly type = DocumentNodeKind.Document;

    public readonly filePath: string;
}

export class NestedSection implements DocumentNode {
    public readonly type = DocumentNodeKind.NestedSection;
}

// TODOs:
// - Link (symbolic and url)
// - Alert
// - List (ordered and unordered)
// - Raw Markdown container
// - Heading

// - "Section"? "Group"? (doesn't generate header hierarchy)?
