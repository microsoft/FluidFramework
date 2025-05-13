/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const summaryTemplate = {
	type: 1,
	tree: {
		".channels": {
			type: 1,
			tree: {
				rootDOId: {
					type: 1,
					tree: {
						".channels": {
							type: 1,
							tree: {
								"7a99532d-94ec-43ac-8a53-d9f978ad4ae9": {
									type: 1,
									tree: {
										"header": {
											type: 2,
											content: '{"value":"123"}',
										},
										".attributes": {
											type: 2,
											content:
												'{"type":"https://graph.microsoft.com/types/cell","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.4.2.0"}',
										},
									},
								},
								"root": {
									type: 1,
									tree: {
										"header": {
											type: 2,
											content:
												'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":-1,"ccIds":["detached"]},"storage":{"tree":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/de68ca53-be31-479e-8d34-a267958997e4"}}}}}}}',
										},
										".attributes": {
											type: 2,
											content:
												'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-internal.4.2.0"}',
										},
									},
								},
							},
						},
						".component": {
							type: 2,
							content:
								'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
						},
					},
				},
			},
		},
		".metadata": {
			type: 2,
			content:
				'{"createContainerRuntimeVersion":"2.0.0-internal.4.2.0","createContainerTimestamp":1683180222333,"summaryNumber":2,"summaryFormatVersion":1,"gcFeature":2,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"sweepTimeoutMs":3110400000,"message":{"clientId":null,"clientSequenceNumber":-1,"minimumSequenceNumber":5,"referenceSequenceNumber":-1,"sequenceNumber":7,"timestamp":1683180249726,"type":"join"},"telemetryDocumentId":"72d29676-b076-43e8-80aa-b8fc7aba1506"}',
		},
		".protocol": {
			type: 1,
			tree: {
				misotest: {
					type: 2,
					content: "ABC",
				},
			},
		},
		".electedSummarizer": {
			type: 2,
			content:
				'{"electedClientId":"f3bda689-ca40-4b68-b2ea-4c02dac76206","electedParentId":"af12d248-f040-413c-a6d1-8e5bd6619313","electionSequenceNumber":7}',
		},
		"gc": {
			type: 1,
			tree: {
				__gc_root: {
					type: 2,
					content:
						'{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/rootDOId":{"outboundRoutes":["/rootDOId/de68ca53-be31-479e-8d34-a267958997e4","/rootDOId/root"]},"/rootDOId/de68ca53-be31-479e-8d34-a267958997e4":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/rootDOId","/rootDOId/de68ca53-be31-479e-8d34-a267958997e4"]}}}',
				},
			},
		},
	},
};

export const snapshotTree = {
	id: "c26019650fe7fc3c1e9f50b906071296008fd9e0",
	blobs: {
		".electedSummarizer": "1779e5eec3d53d36c476f7e365fe09d5eadb5cb7",
		".metadata": "43a9378e44336b39fc8f86f0511a655511922f11",
		".metadata.blobHeaders": "1",
	},
	trees: {
		".channels": {
			id: "1ac6a4929a0fb18b8093679b19d8eed478c908a0",
			blobs: {},
			commits: {},
			trees: {
				rootDOId: {
					id: "5164ec1ecc2cfe24643347e30624aea2976f61e9",
					blobs: {
						".component": "c35bbe00f9cb9ee99c8af3d4757411abdda3d8f3",
					},
					commits: {},
					trees: {
						".channels": {
							id: "9a415dc0f942849ac3d686ec8f8049a4d1484ee1",
							blobs: {},
							commits: {},
							trees: {
								"7a99532d-94ec-43ac-8a53-d9f978ad4ae9": {
									id: "353aab1f600b0dd527073e286b4d6dd853c0d212",
									blobs: {
										".attributes": "d67e9b02c97d8b2d13b1ea88c4198ea6cdae3c06",
										"compressed_2_header": "ee84b67e86708c9dd7fc79ff8f3380b78f000b79",
									},
									commits: {},
									trees: {},
								},
								"root": {
									id: "771be006709c44442dbcd69424b8f89e14a05de8",
									blobs: {
										".attributes": "3ec4a65a74f0e2fab11aaac9b31f284a8c931850",
										"header": "c2de09aa55c92d79b9292d6efb469592915f0b1f",
									},
									commits: {},
									trees: {},
								},
							},
						},
					},
				},
			},
		},
		".logTail": {
			id: "9ae35f3164c7c34c4ed29107af49f2913dc2e948",
			blobs: {
				logTail: "8240863a82570a9eff14ecbc06cee9886d5dc560",
			},
			commits: {},
			trees: {},
		},
		".protocol": {
			id: "f4ab61e0c13030ccd4f56550fcf5e5c271de7152",
			blobs: {
				attributes: "78c80fb681c6b152c48f57526a76bd31ec3b1baf",
				quorumMembers: "cf6929236bacbea80764beb3aba8645210f4af57",
				quorumProposals: "0637a088a01e8ddab3bf3fa98dbe804cbde1a0dc",
				quorumValues: "c730f7a6ff8c606cc2b7d083e5a9705bff0d7029",
				misotest: "misotest-id",
			},
			commits: {},
			trees: {},
		},
		".serviceProtocol": {
			id: "029fc548f99d4b9ef43cd98c401bc5a9f3a2f117",
			blobs: {
				deli: "041b2b724ca853a9d65f4917d5ddb97e91fd7408",
				scribe: "97a0b1e36b67946044b7141ce62cbab6a5996723",
			},
			commits: {},
			trees: {},
		},
		"gc": {
			id: "e8ed0760ac37fd8042020559779ce80b1d88f266",
			blobs: {
				__gc_root: "018d97818f8b519f99c418cb3c33ce5cc4e38e3f",
			},
			commits: {},
			trees: {},
		},
	},
};
