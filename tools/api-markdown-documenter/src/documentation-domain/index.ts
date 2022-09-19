import { Parent as UnistParent, Literal as UnistLiteral, Node as UnistNode } from 'unist';
import {paragraph} from 'mdast';

export enum DocumentNodeKind {
    Document = "Document",
    NestedSection = "NestedSection",
}

export type DocumentNode = DocumentParentNode | DocumentLiteralNode;

export abstract class DocumentParentNode implements UnistParent<DocumentNode> {
    public readonly type: DocumentNodeKind;
    public readonly children: DocumentNode[];
}

export abstract class DocumentLiteralNode implements UnistLiteral<string> {
    public readonly type: DocumentNodeKind;
    public readonly value: string;
}

export class Document implements DocumentParentNode {
    public readonly type = DocumentNodeKind.Document;

    public readonly filePath: string;
}

export class NestedSection implements DocumentParentNode {
    public readonly type = DocumentNodeKind.NestedSection;
}

// TODOs:
// - Link (symbolic and url)
// - Alert
// - List (ordered and unordered)
// - Raw Markdown container
// - Heading

// - "Section"? "Group"? (doesn't generate header hierarchy)?
