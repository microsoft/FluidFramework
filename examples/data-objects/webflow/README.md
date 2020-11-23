# @fluid-example/webflow

WebFlow is an experimental collaborative rich text editor built on top of the Fluid SharedString distributed data structure.

<!-- AUTO-GENERATED-CONTENT:START (GET_STARTED) -->
<!-- AUTO-GENERATED-CONTENT:END -->

## Data Objects

There are three primary data objects:

* The FlowDocument - encapsulates the SharedString and exposes APIs convenient for editing.
* The Editor - renders the editing surface and updates the FlowDocument in response to user input.
* The Host - creates a FlowDocument and attaches an Editor.

## Examples

To host an instance of the Editor, your Fluid object will need to create an instance of a FlowDocument.  In the Host
example, this is done in host/host.ts:

```ts
    const docP = this.createAndAttachDataStore<FlowDocument>(this.docId, FlowDocument.type);
```

On subsequent loads, you'll want to open the same flow document:

```ts
    const docP = this.requestFluidObject<FlowDocument>(this.docId);
```

When the document resolves, pass it to a new Editor instance, along with the HTML DOM node you want the Editor to attach
itself to (see 'host/host.ts'):

```ts
    const editor = new Editor(await docP, root, htmlFormatter);
```

host/host.ts also demonstrates how to connect an application's UI (e.g., toolbar) to editor functionality.
