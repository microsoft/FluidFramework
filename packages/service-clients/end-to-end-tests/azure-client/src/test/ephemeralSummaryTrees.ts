/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * This file contains various summary trees extracted from E2E test runs, and modified to set the isEphemeral flag to true.
 * These trees are used in AzureClientFactory.ts' createContainerFromPayload function to manually create ephemeral container creation requests.
 * We expect this file to no longer be needed in the future, as there are plans to add ephemeral container API surface to the AzureClient,
 * which would remove the need to use these payloads to manually craft creation requests.
 */

const tree1 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/A/_C"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content: '{"blobs":[],"content":{}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1713479876677,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"355f5169-bbc3-4a9c-9867-9bff29f66915","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree2 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"map1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/A/_C"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"new-key":{"type":"Plain","value":"expected-value"}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1713480154010,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"1b4298b3-e74a-40b7-9338-4a0bd4878c66","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree3 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"mdo1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/C"}},"mdo2":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "C",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"storage":{"counter-key":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E/_C"}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content: '{"value":0}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/counter","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/counter-test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "E",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1713480472181,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"73da455a-32fc-4744-acbe-17cc0385d328","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree4 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"mdo1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/C"}},"mdo2":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E"}},"mdo3":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/G"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "C",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"storage":{"counter-key":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E/_C"}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content: '{"value":0}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/counter","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/counter-test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "E",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"storage":{"counter-key":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/G/_C"}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content: '{"value":0}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/counter","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/counter-test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "G",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1713480488205,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"4a888428-66bf-45db-8aa2-923cde25f472","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree5 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"mdo1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/C"}},"mdo2":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "C",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"storage":{"counter-key":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/E/_C"}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content: '{"value":3}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/counter","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/counter-test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "E",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1713480519268,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"e9d50a61-7b79-42f8-88fe-8f277d5dedaf","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree6 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"signaler":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/C"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\",\\"@fluid-example/signaler-test-data-object\\"]","summaryFormatVersion":2,"isRootDataStore":false}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "C",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1715092913112,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"e0997cc5-d335-448e-8762-bc4102bb76dd","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree7 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"tree1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/A/_C"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"trunk":[],"branches":[],"version":2}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "String",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "EditManager",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"version":1,"nodes":{"com.fluidframework.leaf.string":{"leaf":1},"d302b84c-75f6-4ecd-9663-524f467013e3.StringArray":{"object":{"":{"kind":"Sequence","types":["com.fluidframework.leaf.string"]}}}},"root":{"kind":"Value","types":["d302b84c-75f6-4ecd-9663-524f467013e3.StringArray"]}}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "SchemaString",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "Schema",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"keys":["rootFieldKey"],"fields":{"version":1,"identifiers":[],"shapes":[{"c":{"type":"d302b84c-75f6-4ecd-9663-524f467013e3.StringArray","value":false,"fields":[["",1]]}},{"a":2},{"c":{"type":"com.fluidframework.leaf.string","value":true}}],"data":[[0,0]]},"version":1}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "ForestTree",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "Forest",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content: '{"version":1,"data":[],"maxId":0}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "DetachedFieldIndexBlob",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "DetachedFieldIndex",
																			type: "tree",
																		},
																	],
																},
																unreferenced: undefined,
																path: "indexes",
																type: "tree",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/tree","snapshotFormatVersion":"0.0.0","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1715037734979,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"e61ca1ee-56a6-4f0a-a6b6-1d523019b936","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content:
						'"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAPA/AAAAAAAA8D/uA4tXNOgTHQIFXToWSAkCAAAAAAAAAAAAAAAAACCAQAAAAAAAABBA"',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

const tree8 = {
	summary: {
		type: "tree",
		entries: [
			{
				value: {
					type: "tree",
					entries: [
						{
							value: {
								type: "tree",
								entries: [
									{
										value: {
											type: "tree",
											entries: [
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "blob",
																	content:
																		'{"blobs":[],"content":{"ci":{"csn":0,"ccIds":[]},"subdirectories":{"initial-objects-key":{"ci":{"csn":0,"ccIds":["detached"]},"storage":{"tree1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/A/_C"}}}}}}}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: "header",
																type: "blob",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "root",
													type: "tree",
												},
												{
													value: {
														type: "tree",
														entries: [
															{
																value: {
																	type: "tree",
																	entries: [
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"trunk":[],"branches":[],"version":2}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "String",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "EditManager",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"version":1,"nodes":{"com.fluidframework.leaf.string":{"leaf":1},"d302b84c-75f6-4ecd-9663-524f467013e3.StringArray":{"object":{"":{"kind":"Sequence","types":["com.fluidframework.leaf.string"]}}}},"root":{"kind":"Value","types":["d302b84c-75f6-4ecd-9663-524f467013e3.StringArray"]}}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "SchemaString",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "Schema",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content:
																								'{"keys":["rootFieldKey"],"fields":{"version":1,"identifiers":[],"shapes":[{"c":{"type":"d302b84c-75f6-4ecd-9663-524f467013e3.StringArray","value":false,"fields":[["",1]]}},{"a":2},{"c":{"type":"com.fluidframework.leaf.string","value":true}}],"data":[[0,0]]},"version":1}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "ForestTree",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "Forest",
																			type: "tree",
																		},
																		{
																			value: {
																				type: "tree",
																				entries: [
																					{
																						value: {
																							type: "blob",
																							content: '{"version":1,"data":[],"maxId":0}',
																							encoding: "utf8",
																						},
																						unreferenced: undefined,
																						path: "DetachedFieldIndexBlob",
																						type: "blob",
																					},
																				],
																			},
																			unreferenced: undefined,
																			path: "DetachedFieldIndex",
																			type: "tree",
																		},
																	],
																},
																unreferenced: undefined,
																path: "indexes",
																type: "tree",
															},
															{
																value: {
																	type: "blob",
																	content:
																		'{"type":"https://graph.microsoft.com/types/tree","snapshotFormatVersion":"0.0.0","packageVersion":"2.0.0-rc.4.0.0"}',
																	encoding: "utf8",
																},
																unreferenced: undefined,
																path: ".attributes",
																type: "blob",
															},
														],
													},
													unreferenced: undefined,
													path: "_C",
													type: "tree",
												},
											],
										},
										unreferenced: undefined,
										path: ".channels",
										type: "tree",
									},
									{
										value: {
											type: "blob",
											content:
												'{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
											encoding: "utf8",
										},
										unreferenced: undefined,
										path: ".component",
										type: "blob",
									},
								],
							},
							unreferenced: undefined,
							path: "A",
							type: "tree",
						},
					],
				},
				unreferenced: undefined,
				path: ".channels",
				type: "tree",
			},
			{
				value: {
					type: "blob",
					content:
						'{"createContainerRuntimeVersion":"2.0.0-rc.4.0.0","createContainerTimestamp":1715037752782,"summaryNumber":1,"summaryFormatVersion":1,"gcFeature":3,"sessionExpiryTimeoutMs":2592000000,"sweepEnabled":false,"tombstoneTimeoutMs":3110400000,"telemetryDocumentId":"5a32330e-5725-4a94-a994-724b49a9662a","message":{"sequenceNumber":-1},"documentSchema":{"version":1,"refSeq":0,"runtime":{"explicitSchemaControl":true,"compressionLz4":true,"idCompressorMode":"on"}}}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".metadata",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content:
						'"AAAAAAAAAEAAAAAAAAAAAAAAAAAAAPA/AAAAAAAA8D8hHIUZCp3u0BXvmdmqvXoBAAAAAAAAAAAAAAAAACCAQAAAAAAAABBA"',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".idCompressor",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '[["rootDOId","A"]]',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".aliases",
				type: "blob",
			},
			{
				value: {
					type: "blob",
					content: '{"electionSequenceNumber":0}',
					encoding: "utf8",
				},
				unreferenced: undefined,
				path: ".electedSummarizer",
				type: "blob",
			},
		],
	},
	sequenceNumber: 0,
	values: [
		[
			"code",
			{
				key: "code",
				value: {
					package: "no-dynamic-package",
					config: {},
				},
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			},
		],
	],
	enableDiscovery: true,
	generateToken: false,
	isEphemeralContainer: true,
	enableAnyBinaryBlobOnFirstSummary: true,
};

/**
 * Summary tree for the following test case:
 * Fluid Audience: Can find original member
 */
export const findOriginalMember = tree1;

/**
 * Summary tree for the following test case:
 * Fluid Audience: Can find partner member
 */
export const findPartnerMember = tree1;

/**
 * Summary tree for the following test case:
 * Fluid Audience: Can observe member leaving
 */
export const observeMemberLeaving = tree1;

/**
 * Summary tree for the following test case:
 * Container copy scenarios: Can get versions of current document
 */
export const getVersionsOfCurrentDocument = tree1;

/**
 * Summary tree for the following test case:
 * Container copy scenarios: Can copy document successfully
 */
export const copyDocumentSuccessfully = tree1;

/**
 * Summary tree for the following test case:
 * Container copy scenarios: Can successfully copy an existing container at a specific version
 */
export const copyExistingContainerAtSpecificVersion = tree1;

/**
 * Summary tree for the following test case:
 * Container copy scenarios: Correctly copies DDS values when copying container
 */
export const copyDDSValuesWhenCopyingContainer = tree2;

/**
 * Summary tree for the following test case:
 * Container create scenarios: Can attach a container
 */
export const canAttachContainer = tree1;

/**
 * Summary tree for the following test case:
 * Container create scenarios: Cannot attach a container twice
 */
export const cannotAttachContainerTwice = tree1;

/**
 * Summary tree for the following test case:
 * Container create scenarios: Can retrieve existing Azure Fluid Relay container successfully
 */
export const retrieveExistingAFRContainer = tree1;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can set DDSes as initial objects for a container
 */
export const setDDSesAsInitialObjectsForContainer = tree1;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can change DDSes within initialObjects value
 */
export const changeDDSesWithinInitialObjectsValue = tree1;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can set DataObjects as initial objects for a container
 */
export const setDataObjectsAsInitialObjectsForContainer = tree3;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can use multiple DataObjects of the same type
 */
export const useMultipleDataObjectsOfSameType = tree4;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can change DataObjects within initialObjects value
 */
export const changeDataObjectsWithinInitialObjectsValue = tree5;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can create/add loadable objects (custom data object) dynamically during runtime
 */
export const createAddLoadableObjectsDynamically = tree1;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can send and receive signals
 */
export const sendAndRecieveSignals = tree6;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can create a container with SharedTree and do basic ops
 */
export const createContainerWithSharedTree = tree7;

/**
 * Summary tree for the following test case:
 * Fluid data updates: Can create/load a container with SharedTree collaborate with basic ops
 */
export const createLoadContainerWithSharedTree = tree8;
