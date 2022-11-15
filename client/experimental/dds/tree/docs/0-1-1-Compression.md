# 0.1.1 Compression

The 0.1.1 format brings a number of improvements to how we encode edit information in ops and summaries.
To reduce bloat in common property names, we use the following union type of arrays to represent a tree:

```typescript
export type CompressedTraits<TId extends OpSpaceNodeId, TPlaceholder extends number | never> = (
	| InternedStringId
	| TraitLabel
	| (CompressedPlaceholderTree<TId, TPlaceholder> | TPlaceholder)[]
)[];

export type CompressedPlaceholderTree<TId extends OpSpaceNodeId, TPlaceholder extends number | never> =
	| TPlaceholder
	| [InternedStringId | Definition] // The node Definition's interned string ID
	| [InternedStringId | Definition, TId]
	| [
			InternedStringId | Definition,
			[Payload, ...CompressedTraits<TId, TPlaceholder>] | CompressedTraits<TId, TPlaceholder>
	  ]
	| [InternedStringId, TId, [Payload, ...CompressedTraits<TId, TPlaceholder>] | CompressedTraits<TId, TPlaceholder>];
```

This type incorporates 4 major compression optimizations:

1. Structural compression
2. Definition/trait label interning
3. Identifier compression
4. Sequential identifier elision

These optimizations will be presented sequentially, starting from the same initial tree (the "test tree" used in many shared-tree tests).

## Structural compression

Conceptually, we pack the object types more densely into an array to avoid long property names such as "definition" and "identifier" being repeated.
The particular format we use is an array whose first element is the definition, the second element is the identifier (if not elided--see [Identifier Elision](#identifier-elision)), and whose last element is a compressed traits/payload object.
A compressed set of traits is an alternating array of trait labels and trait contents.
When the payload is present, it is inserted as the first element of the array.
This allows detection of if a node has a payload using the parity of the length of the array.

For example, this 0.0.2 summary:

```json
{
	"currentTree": {
		"definition": "51c58718-47b9-4fe4-ad46-56312f3b9e86",
		"identifier": "24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6",
		"traits": {
			"e276f382-fa99-49a1-ae81-42001791c733": [
				{
					"definition": "node",
					"identifier": "25de3875-9537-47ec-8699-8a85e772a509",
					"traits": {
						"left": [
							{
								"definition": "node",
								"identifier": "ae6b24eb-6fa8-42cc-abd2-48f250b7798f",
								"payload": 248,
								"traits": {}
							},
							{ "definition": "node", "identifier": "a083857d-a8e1-447a-ba7c-92fd0be9db2b", "traits": {} }
						],
						"right": [
							{ "definition": "node", "identifier": "78849e85-cb7f-4b93-9fdc-18439c60fe30", "traits": {} }
						]
					}
				}
			]
		}
	}
}
```

would be structurally compressed to:

```json
{
	"currentTree": [
		"51c58718-47b9-4fe4-ad46-56312f3b9e86",
		"24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6",
		[
			"e276f382-fa99-49a1-ae81-42001791c733",
			[
				[
					"node",
					"25de3875-9537-47ec-8699-8a85e772a509",
					[
						"left",
						[
							["node", "ae6b24eb-6fa8-42cc-abd2-48f250b7798f", [248]],
							["node", "a083857d-a8e1-447a-ba7c-92fd0be9db2b"]
						],
						"right",
						[["node", "78849e85-cb7f-4b93-9fdc-18439c60fe30"]]
					]
				]
			]
		]
	]
}
```

## Definition and Trait Label interning

Typical `SharedTree` users will likely have a relatively small common set of definitions and trait labels used for actual content, often conforming to some schema.
We can leverage this fact by interning the strings and storing references to them in trees.
This interning can be associated with each document by storing a list of interned strings in the summary and ensuring all clients agree on which order to sequence newly used definitions/identifiers.
Interning such values on each sequenced op in a consistent tree walk order suffices to achieve such consensus.

Applying this on top of the previous optimization would yield a summary resembling the following:

```json
{
	"currentTree": [
		0,
		"24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6",
		[
			1,
			[
				[
					2,
					"25de3875-9537-47ec-8699-8a85e772a509",
					[
						3,
						[
							[2, "ae6b24eb-6fa8-42cc-abd2-48f250b7798f", [248]],
							[2, "a083857d-a8e1-447a-ba7c-92fd0be9db2b"]
						],
						4,
						[[2, "78849e85-cb7f-4b93-9fdc-18439c60fe30"]]
					]
				]
			]
		]
	],
	"internedStrings": [
		"51c58718-47b9-4fe4-ad46-56312f3b9e86",
		"e276f382-fa99-49a1-ae81-42001791c733",
		"node",
		"left",
		"right"
	]
}
```

In the future, this strategy also enables the potential for GC of formerly used definitions, though that isn't implemented with the introduction of 0.1.1.

### Identifier Compression

SharedTree uses a strategy for identifier compression outlined in [IdCompressor.ts](../src/id-compressor/IdCompressor.md) which allows identities to be allocated in clusters for each session.
This enables ops/summaries to be written in terms of smaller numbers (offsets) from those clusters.
The upgrade/migration strategy from 0.0.2 is not entirely straightforward, but if the specific identifiers used for the summary above are not significant and the same tree were recreated on a 0.1.1 document, its summary could instead resemble the following:

```javascript
{
	"currentTree": [
		0,
		0,
		[
			1,
			[
				[
					2,
					1,
					[
						3,
						[
							[2, 2, [248]],
							[2, 3]
						],
						4,
						[[2, 4]]
					]
				]
			]
		]
	],
	"internedStrings": [
		"51c58718-47b9-4fe4-ad46-56312f3b9e86",
		"e276f382-fa99-49a1-ae81-42001791c733",
		"node",
		"left",
		"right"
	],
	"idCompressor": { /* some serialized representation of the id compressor; in practice this might symbolize some intent along the lines of "ids 0-4 are offsets from the uuid '24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6'" */ }
}
```

### Identifier Elision

In the common case, consumers of `SharedTree` will build a tree without caring what identifier is chosen for each node.
In this case, the tree will be given identifiers in a depth-first preorder traversal.
Since there is a canonical order, we can therefore _omit_ identifiers that are the expected next value, only including them on nodes which aren't just the following allocated value.
Then, on decoding, we track the current "next identifier" and use that if the compressed format doesn't include an override.
For the above tree, this would be all nodes except for the root.

```javascript
{
	"currentTree": [
		0,
		[
			1,
			[
				[
					2,
					[
						3,
						[
							[2, [248]],
							[2]
						],
						4,
						[[2]]
					]
				]
			]
		]
	],
	"internedStrings": [
		"51c58718-47b9-4fe4-ad46-56312f3b9e86",
		"e276f382-fa99-49a1-ae81-42001791c733",
		"node",
		"left",
		"right"
	],
	"idCompressor": { /* some serialized representation of the id compressor; in practice this might symbolize some intent along the lines of "ids 0-4 are offsets from the uuid '24e26f0b-3c1a-47f8-a7a1-e8461ddb69ce6'" */ }
}
```
