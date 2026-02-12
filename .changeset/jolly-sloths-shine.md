---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
New beta ExtensibleUnionNode API

The new `ExtensibleUnionNode` API allows for creation of unions which can tolerate future additions not yet known to the current code.

 ```typescript
 const sf = new SchemaFactoryBeta("extensibleUnionNodeExample.items");
 class ItemA extends sf.object("A", { x: sf.string }) {}
 class ItemB extends sf.object("B", { x: sf.number }) {}

 class AnyItem extends ExtensibleUnionNode.createSchema(
 	[ItemA, ItemB], // Future versions may add more members here
 	sf,
 	"ExtensibleUnion",
 ) {}
 // Instances of the union are created using `create`.
 const anyItem = AnyItem.create(new ItemA({ x: "hello" }));
 // Reading the content from the union is done via the `union` property,
 // which can be `undefined` to handle the case where a future version of this schema allows a type unknown to the current version.
 const childNode: ItemA | ItemB | undefined = anyItem.union;
 // To determine which member of the union was present, its schema can be inspected:
 const aSchema = Tree.schema(childNode ?? assert.fail("No child"));
 assert.equal(aSchema, ItemA);
 ```
