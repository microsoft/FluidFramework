# @fluid-example/table-tree

**Table** example is a more advanced Fluid Framework app that demonstrates real-time collaboration on a structured table.
It uses React for rendering and showcases dynamic row and column management, type-specific cell rendering (e.g., checkbox, date, text), and drag-and-drop reordering.


<!-- markdown-magic:begin {"transform":"example-app-readme-header","usesTinylicious":false,"headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Getting Started

Complete these steps to run the example:

1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).
2. From the `FluidFramework` root directory, run `pnpm install`.
3. From the `FluidFramework` root directory, run `pnpm run build:fast --nolint`.
   * To build only this package, add the package name to the command:
     `pnpm run build:fast --nolint @fluid-example/table-tree`
4. Run `pnpm start` from this directory.
5. Open <http://localhost:8080> in a web browser.

To run the example with SharePoint, complete these steps:

1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.
2. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.
3. Open <http://localhost:8080> in a web browser.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->

## Table Fluid objects

There is a single Fluid object that make up the Table application:

### [TableDataObject](./src/Table/dataObject.js)

A TableDataObject is the top level Fluid object. It can create, remove, move rows and columns into the table.

## The views

### [TableView](./src/Table/tableRowView.tsx)

The default view is a TableView mapping to a TableDataObject. It uses the Fluent UI library to display its contents, and imports the TableRowView to get the contents of the table. It also provides buttons to add a new row.

### [TableRowView](./src/Table/tableRowView.tsx)

The TableRowView uses the Fluent UI library to display its contents, and gets refers to the table's column ids to get the correct cell data. It renders different types of cells depending on the column type, and also provides a button to delete the row.

### [TableHeaderView](./src/Table/tableHeaderView.tsx)

The TableHeaderView uses the Fluent UI library to display its contents. It provides the header of the table.

## The container code

The container code includes a request handler that provides views to the data stored within. For a default (empty) request, it provides a TodoView in response. The container code's request handler can also provide back a TodoItemView directly when a direct link is used.

<!-- markdown-magic:begin {"transform":"readme-footer","headingLevel":2} -->

<!-- prettier-ignore-start -->

<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

You can [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid Framework in these ways:

* Answer questions in [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
* [Submit bug reports](https://github.com/microsoft/FluidFramework/issues) and help verify fixes.
* Review [source code changes](https://github.com/microsoft/FluidFramework/pulls).
* [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

For detailed instructions, read the [repo documentation](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Home.md).

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information, read the [Code of Conduct frequently asked questions](https://opensource.microsoft.com/codeofconduct/faq/).
For questions or comments, contact <opencode@microsoft.com>.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Read the [Fluid Framework documentation](https://fluidframework.com/docs/) for information about Fluid Framework concepts and APIs.

To request information that the documentation does not contain, [create an issue](https://github.com/microsoft/FluidFramework/blob/main/docs/content/Contributing/Submitting-Bugs-and-Feature-Requests.md).

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- markdown-magic:end -->
