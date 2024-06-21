/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const NoIndexPaging = require("../../src/materialized_history_service/query_pipeline/paging/no_index_paging");

describe("No Index Paging", () => {
	describe("with no property matching the pagingPrefix", () => {
		let changeSet = {
			insert: {
				String: {
					a: "Value",
				},
			},
		};

		it("should not crash and return an empty changeSet", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {},
				queryPaths: [],
			});
		});
	});

	describe("with a nested pathPrefix, single level paging.orderBy", () => {
		let changeSet = {
			insert: {
				NodeProperty: {
					myNodeProperty: {
						insert: {
							"map<mysample:point2d-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point2d-1.0.0": {
											pointF: {
												Float64: {
													x: -16.0,
													y: -32.0,
												},
											},
											pointG: {
												Float64: {
													x: -8.0,
													y: -16.0,
												},
											},
											pointH: {
												Float64: {
													x: -4.0,
													y: -8.0,
												},
											},
											pointI: {
												Float64: {
													x: -2.0,
													y: -4.0,
												},
											},
											pointJ: {
												Float64: {
													x: -1.0,
													y: -2.0,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myNodeProperty.myPointsMap",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let limitedPaths = [
				"myNodeProperty.myPointsMap.pointF",
				"myNodeProperty.myPointsMap.pointG",
				"myNodeProperty.myPointsMap.pointH",
				"myNodeProperty.myPointsMap.pointI",
				"myNodeProperty.myPointsMap.pointJ",
			];

			let result = await NoIndexPaging.doPaging(query, changeSet, limitedPaths);
			expect(result).to.eql({
				changeSet: {
					insert: {
						NodeProperty: {
							myNodeProperty: {
								insert: {
									"map<mysample:point2d-1.0.0>": {
										myPointsMap: {
											insert: {
												"mysample:point2d-1.0.0": {
													pointG: {
														Float64: {
															x: -8.0,
															y: -16.0,
														},
													},
													pointH: {
														Float64: {
															x: -4.0,
															y: -8.0,
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myNodeProperty.myPointsMap.pointG", "myNodeProperty.myPointsMap.pointH"],
			});
		});
	});

	describe("paging properties at the root", () => {
		let changeSet = {
			insert: {
				"mysample:point2d-1.0.0": {
					pointF: {
						Float64: {
							x: -16.0,
							y: -32.0,
						},
					},
					pointG: {
						Float64: {
							x: -8.0,
							y: -16.0,
						},
					},
					pointH: {
						Float64: {
							x: -4.0,
							y: -8.0,
						},
					},
					pointI: {
						Float64: {
							x: -2.0,
							y: -4.0,
						},
					},
					pointJ: {
						Float64: {
							x: -1.0,
							y: -2.0,
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let limitedPaths = ["pointF", "pointG", "pointH", "pointI", "pointJ"];

			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "y",
							direction: "DESC",
						},
					],
					limit: 5,
					offset: 4,
				},
			};
			let result = await NoIndexPaging.doPaging(query, changeSet, limitedPaths);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"mysample:point2d-1.0.0": {
							pointF: {
								Float64: {
									x: -16.0,
									y: -32.0,
								},
							},
						},
					},
				},
				queryPaths: ["pointF"],
			});
		});
	});

	describe("with paging.orderBy more than one level deep", () => {
		let changeSet = {
			insert: {
				"mysample:nestable-1.0.0": {
					nestableA: {
						"Float64": {
							a: -16.0,
						},
						"mysample:nestable-1.0.0": {
							nestable2: {
								Float64: {
									a: 7777.0,
								},
							},
						},
					},
					nestableB: {
						"Float64": {
							a: -17.0,
						},
						"mysample:nestable-1.0.0": {
							nestable2: {
								"Float64": {
									a: 9999.0,
								},
								"mysample:nestable-1.0.0": {
									nestable3: {
										Float64: {
											a: 9999.0,
										},
									},
								},
							},
						},
					},
					nestableC: {
						"Float64": {
							a: -18.0,
						},
						"mysample:nestable-1.0.0": {
							nestable2: {
								Float64: {
									a: -571.0,
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "",
						typeId: "mysample:nestable-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "nestable2.a",
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 0,
				},
			};

			let limitedPaths = [
				"nestableA",
				"nestableA.nestable2",
				"nestableB",
				"nestableB.nestable2.nestable3",
				"nestableC",
				"nestableC.nestable2",
			];

			let result = await NoIndexPaging.doPaging(query, changeSet, limitedPaths);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"mysample:nestable-1.0.0": {
							nestableA: {
								"Float64": {
									a: -16.0,
								},
								"mysample:nestable-1.0.0": {
									nestable2: {
										Float64: {
											a: 7777.0,
										},
									},
								},
							},
							nestableB: {
								"Float64": {
									a: -17.0,
								},
								"mysample:nestable-1.0.0": {
									nestable2: {
										"Float64": {
											a: 9999.0,
										},
										"mysample:nestable-1.0.0": {
											nestable3: {
												Float64: {
													a: 9999.0,
												},
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["nestableB", "nestableA"],
			});
		});
	});

	describe("with offsets out of bound", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Float64: {
										x: -16.0,
										y: -32.0,
									},
								},
								pointG: {
									Float64: {
										x: -8.0,
										y: -16.0,
									},
								},
								pointH: {
									Float64: {
										x: -4.0,
										y: -8.0,
									},
								},
								pointI: {
									Float64: {
										x: -2.0,
										y: -4.0,
									},
								},
								pointJ: {
									Float64: {
										x: -1.0,
										y: -2.0,
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 1,
					offset: 600,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"map<mysample:point2d-1.0.0>": {
							myPointsMap: {},
						},
					},
				},
				queryPaths: [],
			});
		});
	});

	describe("with items having orderBy undefined", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Float64: {
										y: -32.0,
									},
								},
								pointG: {
									Float64: {
										x: -8.0,
										y: -16.0,
									},
								},
								pointH: {
									Float64: {
										y: -8.0,
									},
								},
								pointI: {
									Float64: {
										x: -2.0,
										y: -4.0,
									},
								},
								pointJ: {
									Float64: {
										x: -1.0,
										y: -2.0,
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let limitedPaths = [
				"myPointsMap.pointF",
				"myPointsMap.pointG",
				"myPointsMap.pointH",
				"myPointsMap.pointI",
				"myPointsMap.pointJ",
			];

			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet, limitedPaths);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"map<mysample:point2d-1.0.0>": {
							myPointsMap: {
								insert: {
									"mysample:point2d-1.0.0": {
										pointG: {
											Float64: {
												x: -8.0,
												y: -16.0,
											},
										},
										pointH: {
											Float64: {
												y: -8.0,
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myPointsMap.pointH", "myPointsMap.pointG"],
			});
		});
	});

	describe("with items having orderBy Int64", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Int64: {
										x: [1, 2],
										y: [1, 2],
									},
								},
								pointG: {
									Int64: {
										x: [5, 6],
										y: [1, 2],
									},
								},
								pointH: {
									Int64: {
										x: [5, 4],
										y: [1, 2],
									},
								},
								pointI: {
									Int64: {
										x: [7, 8],
										y: [1, 2],
									},
								},
								pointJ: {
									Int64: {
										x: [1, 2],
										y: [1, 2],
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"map<mysample:point2d-1.0.0>": {
							myPointsMap: {
								insert: {
									"mysample:point2d-1.0.0": {
										pointH: {
											Int64: {
												x: [5, 4],
												y: [1, 2],
											},
										},
										pointG: {
											Int64: {
												x: [5, 6],
												y: [1, 2],
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myPointsMap.pointG", "myPointsMap.pointH"],
			});
		});
	});

	describe("with items having orderBy UInt64", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Uint64: {
										x: [1, 2],
										y: [1, 2],
									},
								},
								pointG: {
									Uint64: {
										x: [1, 2],
										y: [1, 2],
									},
								},
								pointH: {
									Uint64: {
										x: [5, 6],
										y: [1, 2],
									},
								},
								pointI: {
									Uint64: {
										x: [9, 10],
										y: [1, 2],
									},
								},
								pointJ: {
									Uint64: {
										x: [7, 8],
										y: [1, 2],
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"map<mysample:point2d-1.0.0>": {
							myPointsMap: {
								insert: {
									"mysample:point2d-1.0.0": {
										pointJ: {
											Uint64: {
												x: [7, 8],
												y: [1, 2],
											},
										},
										pointH: {
											Uint64: {
												x: [5, 6],
												y: [1, 2],
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myPointsMap.pointJ", "myPointsMap.pointH"],
			});
		});
	});

	describe("with non-uniform orderBy", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Uint64: {
										x: [1, 2],
										y: [1, 2],
									},
								},
								pointG: {
									Uint64: {
										x: [3, 4],
										y: [1, 2],
									},
								},
								pointH: {
									Float64: {
										x: 1,
										y: 2,
									},
								},
								pointI: {
									Uint64: {
										x: [7, 8],
										y: [1, 2],
									},
								},
								pointJ: {
									Uint64: {
										x: [9, 10],
										y: [1, 2],
									},
								},
							},
						},
					},
				},
			},
		};

		it("should throw", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			return expect(NoIndexPaging.doPaging(query, changeSet)).to.be.rejectedWith(
				"Attempting to perform sorting on different types for orderBy Float64/Uint64",
			);
		});
	});

	describe("with a non-primitive orderBy", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									NodeProperty: {
										x: {},
										y: {},
									},
								},
								pointG: {
									NodeProperty: {
										x: {},
										y: {},
									},
								},
								pointH: {
									NodeProperty: {
										x: {},
										y: {},
									},
								},
								pointI: {
									NodeProperty: {
										x: {},
										y: {},
									},
								},
								pointJ: {
									NodeProperty: {
										x: {},
										y: {},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should throw", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			return expect(NoIndexPaging.doPaging(query, changeSet)).to.be.rejectedWith(
				"Attempting to perform paging on a non-primitive orderBy, type was NodeProperty",
			);
		});
	});

	describe("with many items having orderBy undefined", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									Float64: {
										y: -32.0,
									},
								},
								pointG: {
									Float64: {
										y: -16.0,
									},
								},
								pointH: {
									Float64: {
										y: -8.0,
									},
								},
								pointI: {
									Float64: {
										x: -2.0,
										y: -4.0,
									},
								},
								pointJ: {
									Float64: {
										y: -2.0,
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "x",
							direction: "ASC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						"map<mysample:point2d-1.0.0>": {
							myPointsMap: {
								insert: {
									"mysample:point2d-1.0.0": {
										pointG: {
											Float64: {
												y: -16.0,
											},
										},
										pointH: {
											Float64: {
												y: -8.0,
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myPointsMap.pointG", "myPointsMap.pointH"],
			});
		});
	});

	describe("with a nested pathPrefix, sorting by map item key", () => {
		let changeSet = {
			insert: {
				NodeProperty: {
					myNodeProperty: {
						insert: {
							"map<mysample:point2d-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point2d-1.0.0": {
											pointF: {
												Float64: {
													x: -16.0,
													y: -32.0,
												},
											},
											pointJ: {
												Float64: {
													x: -1.0,
													y: -2.0,
												},
											},
											pointG: {
												Float64: {
													x: -8.0,
													y: -16.0,
												},
											},
											pointH: {
												Float64: {
													x: -4.0,
													y: -8.0,
												},
											},
											pointI: {
												Float64: {
													x: -2.0,
													y: -4.0,
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myNodeProperty.myPointsMap",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						NodeProperty: {
							myNodeProperty: {
								insert: {
									"map<mysample:point2d-1.0.0>": {
										myPointsMap: {
											insert: {
												"mysample:point2d-1.0.0": {
													pointI: {
														Float64: {
															x: -2.0,
															y: -4.0,
														},
													},
													pointH: {
														Float64: {
															x: -4.0,
															y: -8.0,
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myNodeProperty.myPointsMap.pointI", "myNodeProperty.myPointsMap.pointH"],
			});
		});
	});

	describe("with a nested pathPrefix, sorting by string attributes", () => {
		let changeSet = {
			insert: {
				NodeProperty: {
					myNodeProperty: {
						insert: {
							"map<mysample:person-1.0.0>": {
								myPersonsMap: {
									insert: {
										"mysample:person-1.0.0": {
											John: {
												String: {
													firstName: "John",
													lastName: "Travolta",
												},
											},
											Jack: {
												String: {
													firstName: "Jack",
													lastName: "Black",
												},
											},
											Alex: {
												String: {
													firstName: "Alex",
													lastName: "Rodriguez",
												},
											},
											Alex2: {
												String: {
													firstName: "Alex",
													lastName: "Pacino",
												},
											},
											Mike: {
												String: {
													firstName: "Mike",
													lastName: "Jackson",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myNodeProperty.myPersonsMap",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "firstName",
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet);
			expect(result).to.eql({
				changeSet: {
					insert: {
						NodeProperty: {
							myNodeProperty: {
								insert: {
									"map<mysample:person-1.0.0>": {
										myPersonsMap: {
											insert: {
												"mysample:person-1.0.0": {
													John: {
														String: {
															firstName: "John",
															lastName: "Travolta",
														},
													},
													Jack: {
														String: {
															firstName: "Jack",
															lastName: "Black",
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myNodeProperty.myPersonsMap.John", "myNodeProperty.myPersonsMap.Jack"],
			});
		});
	});

	describe("with a nested pathPrefix, sorting by multiple attributes", () => {
		let changeSet = {
			insert: {
				NodeProperty: {
					myNodeProperty: {
						insert: {
							"map<mysample:person-1.0.0>": {
								myPersonsMap: {
									insert: {
										"mysample:person-1.0.0": {
											John: {
												String: {
													firstName: "John",
													lastName: "Travolta",
												},
											},
											Jack: {
												String: {
													firstName: "Jack",
													lastName: "Black",
												},
											},
											Alex: {
												String: {
													firstName: "Alex",
													lastName: "Rodriguez",
												},
											},
											ZAlex: {
												String: {
													firstName: "Alex",
													lastName: "Pacino",
												},
											},
											Mike: {
												String: {
													firstName: "Mike",
													lastName: "Jackson",
												},
											},
										},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should return the proper result", async () => {
			let limitedPaths = [
				"myNodeProperty.myPersonsMap.John",
				"myNodeProperty.myPersonsMap.Jack",
				"myNodeProperty.myPersonsMap.Alex",
				"myNodeProperty.myPersonsMap.ZAlex",
				"myNodeProperty.myPersonsMap.Mike",
			];

			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myNodeProperty.myPersonsMap",
						depthLimit: 1,
					},
				],
				paging: {
					order: [
						{
							by: "firstName",
							direction: "ASC",
						},
						{
							by: "lastName",
							direction: "DESC",
						},
					],
					limit: 2,
					offset: 1,
				},
			};

			let result = await NoIndexPaging.doPaging(query, changeSet, limitedPaths);
			expect(result).to.eql({
				changeSet: {
					insert: {
						NodeProperty: {
							myNodeProperty: {
								insert: {
									"map<mysample:person-1.0.0>": {
										myPersonsMap: {
											insert: {
												"mysample:person-1.0.0": {
													ZAlex: {
														String: {
															firstName: "Alex",
															lastName: "Pacino",
														},
													},
													Jack: {
														String: {
															firstName: "Jack",
															lastName: "Black",
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				queryPaths: ["myNodeProperty.myPersonsMap.ZAlex", "myNodeProperty.myPersonsMap.Jack"],
			});
		});
	});
});
