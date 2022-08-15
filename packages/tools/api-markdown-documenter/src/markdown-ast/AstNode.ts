import { Node as AstNode, Parent as AstParentNode } from "unist";

export type SectionAstNode = AstParentNode<AstNode> & {
    type: "section";
};

export type HeadingAstNode = AstNode<{ id?: string }>;

export function buildSection(children: AstNode[]): SectionAstNode {
    return {
        // TODO: position and data?
        type: "section",
        children,
    };
}
