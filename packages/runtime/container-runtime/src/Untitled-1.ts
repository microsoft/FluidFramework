type RuntimeOp = ["component", string, ...unknown[]];
["attach", IAttachMess];
["component" | "attach" | "gc", string, ...unknown[]];

declare const incoming: (string | { id: string; data: unknown })[];

const [runtimeType, id, ...rest] = incoming as RuntimeOp;

const x = [
	{
		// op from DDS
		"type": "op",
		"contents": {
			"payload": [
				"component",
				"default",
				"ddsOp",
				{
					"routing": "dds1",
					"data": {
						"key": "dataStoreA",
						"path": "/",
						"type": "set",
						"value": {
							"type": "Plain",
							"value": {
								"type": "__fluid_handle__",
								"url": "/821f974f-b73b-44d2-b0a5-6bd2965104b4",
							},
						},
					},
				},
			],
			"theoreticalFutureMetadataOutsideTheRoutedPayload": 123,
		},
	},
	{
		// op from DDS
		type: "op",
		contents: {
			payload: [
				{ id: "default", type: "component" },
				{
					id: "dds1",
					type: "ddsOp",
					data: {
						key: "dataStoreA",
						path: "/",
						type: "set",
						value: {
							type: "Plain",
							value: {
								type: "__fluid_handle__",
								url: "/821f974f-b73b-44d2-b0a5-6bd2965104b4",
							},
						},
					},
				},
			],
			theoreticalFutureMetadataOutsideTheRoutedPayload: 123,
		},
	},
	{
		type: "op",
		contents: {
			"routedPayloads": [
				{ type: "EXT", id: "thing1" },
/			],
		}
	}
	{
		// DDS attach op
		"type": "op",
		"contents": {
			"path": "/__component/default/__attach/testChannel1",
			"data": [
				{
					"snapshot": {
						"entries": ["ALL THE STUFF"],
					},
					"type": "https://graph.microsoft.com/types/map",
				},
			],
		},
	},
	{
		// DataStore attach op
		"type": "op",
		"contents": {
			"path": "/__attach/821f974f-b73b-44d2-b0a5-6bd2965104b4",
			"data": [
				{
					"snapshot": {
						"entries": ["ALL THE STUFF"],
					},
					"type": "@fluid-example/test-dataStore",
				},
			],
		},
	},
	{
		// Theoretical example with multiple data entries
		"type": "op",
		"contents": {
			"path": "/__container/default/__op/dir1/__subdir/foo",
			"data": [
				{
					"dataStoreMetadata": "hello world", // This would be set / peeled off by the DataStore
				},
				{
					"type": "set", // This would be set / peeled off by the Directory
				},
				{
					"value": "bar", // This would be set / peeled off by the Subdirectory
				},
			],
		},
	},
];
