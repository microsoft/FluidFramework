// TODOs:
// - Consider extensibility of this list? How can consumers introduce custom types here?

/**
 * Kind of document domain node. Used to dispatch on different document domain node implementations.
 *
 * @remarks Any given {@link DocumentationNode} implementation will specify a unique value as
 * its {@link DocumentationNode."type"}.
 */
export enum DocumentationNodeType {
    Alert = "Alert",
    BlockQuote = "BlockQuote",
    CodeSpan = "CodeSpan",
    Document = "Document",
    FencedCode = "FencedCode",
    Heading = "Heading",
    LineBreak = "LineBreak",
    Link = "Link",
    HierarchicalSection = "HierarchicalSection",
    OrderedList = "OrderedList",
    Paragraph = "Paragraph",
    PlainText = "PlainText",
    Span = "Span",
    Table = "Table",
    TableCell = "TableCell",
    TableRow = "TableRow",
    UnorderedList = "UnorderedList",
}
