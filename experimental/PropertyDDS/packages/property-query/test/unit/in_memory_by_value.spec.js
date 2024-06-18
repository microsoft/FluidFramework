/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint max-nested-callbacks: [0, 0] */
const InMemoryByValue = require("../../src/materialized_history_service/query_pipeline/filtering/in_memory_by_value");
const { OperationError } = require("@fluid-experimental/property-common");
const Long = require("long");

describe("In Memory Filtering By Value", () => {
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
						where: {
							eq: {
								x: -24,
							},
						},
					},
				],
			};

			let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
			expect(result).to.eql({
				changeSet: {},
				queryPaths: [],
			});
		});
	});

	describe("with evaluation on a non-primitive type", () => {
		let changeSet = {
			insert: {
				"map<mysample:point2d-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point2d-1.0.0": {
								pointF: {
									NodeProperty: {
										x: {},
									},
								},
							},
						},
					},
				},
			},
		};

		it("should throw an error because filtering on non-primitive", async () => {
			let query = {
				queryLanguage: "queryV1",
				from: [
					{
						pathPrefix: "myPointsMap",
						typeId: "mysample:point2d-1.0.0",
						depthLimit: 1,
						where: {
							eq: {
								x: -24,
							},
						},
					},
				],
			};

			return expect(
				InMemoryByValue.filterByValue(query.from[0], changeSet),
			).to.be.rejectedWith(
				OperationError,
				"Attempting to perform filtering on a non-primitive field, type was NodeProperty",
			);
		});
	});

	describe("with a nested pathPrefix (native comparable values)", () => {
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
											pointK: {
												// Ensures that it doesn't crash for undefined members
												Float64: {},
											},
										},
									},
								},
							},
						},
					},
					aNode: {},
				},
			},
		};

		describe("with two eq clauses", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myNodeProperty.myPointsMap",
							depthLimit: 1,
							where: {
								eq: {
									x: -4,
									y: -8,
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
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
					queryPaths: ["myNodeProperty.myPointsMap.pointH"],
				});
			});
		});

		describe("when comparing to a string value", () => {
			it("should return an empty result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myNodeProperty.myPointsMap",
							depthLimit: 1,
							where: {
								eq: {
									x: "Paul",
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {},
					queryPaths: [],
				});
			});
		});

		describe("in clause", () => {
			describe("with numeric values", () => {
				it("should return the proper result", async () => {
					let query = {
						queryLanguage: "queryV1",
						from: [
							{
								pathPrefix: "myNodeProperty.myPointsMap",
								depthLimit: 1,
								where: {
									in: {
										x: [-16, -2],
									},
								},
							},
						],
					};

					let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
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
															pointF: {
																Float64: {
																	x: -16.0,
																	y: -32.0,
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
						},
						queryPaths: [
							"myNodeProperty.myPointsMap.pointF",
							"myNodeProperty.myPointsMap.pointI",
						],
					});
				});
			});

			describe("with string values", () => {
				it("should return an empty result", async () => {
					let query = {
						queryLanguage: "queryV1",
						from: [
							{
								pathPrefix: "myNodeProperty.myPointsMap",
								where: {
									in: {
										x: ["Paul", "Peter"],
									},
								},
							},
						],
					};

					let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
					expect(result).to.eql({
						changeSet: {},
						queryPaths: [],
					});
				});
			});
		});

		describe("gt, lt clause", () => {
			describe("with numeric values", () => {
				it("should return the proper result", async () => {
					let query = {
						queryLanguage: "queryV1",
						from: [
							{
								pathPrefix: "myNodeProperty.myPointsMap",
								depthLimit: 1,
								where: {
									gt: {
										x: -8,
									},
									lt: {
										x: -1,
									},
								},
							},
						],
					};

					let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
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
						},
						queryPaths: [
							"myNodeProperty.myPointsMap.pointH",
							"myNodeProperty.myPointsMap.pointI",
						],
					});
				});
			});

			describe("with string values", () => {
				it("should return an empty result", async () => {
					let query = {
						queryLanguage: "queryV1",
						from: [
							{
								pathPrefix: "myNodeProperty.myPointsMap",
								depthLimit: 1,
								where: {
									gt: {
										x: "Paul",
									},
									lt: {
										x: "Peter",
									},
								},
							},
						],
					};

					let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
					expect(result).to.eql({
						changeSet: {},
						queryPaths: [],
					});
				});
			});
		});

		describe("gte, lte clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myNodeProperty.myPointsMap",
							depthLimit: 1,
							where: {
								gte: {
									x: -8,
								},
								lte: {
									x: -1,
								},
							},
						},
					],
				};

				let limitPaths = [
					"myNodeProperty.myPointsMap.pointF",
					"myNodeProperty.myPointsMap.pointG",
					"myNodeProperty.myPointsMap.pointH",
					"myNodeProperty.myPointsMap.pointI",
					"myNodeProperty.myPointsMap.pointJ",
					"myNodeProperty.myPointsMap.pointK",
				];

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet, limitPaths);
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
					},
					queryPaths: [
						"myNodeProperty.myPointsMap.pointG",
						"myNodeProperty.myPointsMap.pointH",
						"myNodeProperty.myPointsMap.pointI",
						"myNodeProperty.myPointsMap.pointJ",
					],
				});
			});
		});

		describe("not clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myNodeProperty.myPointsMap",
							depthLimit: 1,
							where: {
								not: {
									gte: {
										x: -8,
									},
									lte: {
										x: -1,
									},
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
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
														pointF: {
															Float64: {
																x: -16,
																y: -32,
															},
														},
														pointK: {
															Float64: {},
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
					queryPaths: [
						"myNodeProperty.myPointsMap.pointF",
						"myNodeProperty.myPointsMap.pointK",
					],
				});
			});
		});

		describe("or clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myNodeProperty.myPointsMap",
							depthLimit: 1,
							where: {
								or: [
									{
										gt: {
											x: -8,
										},
									},
									{
										eq: {
											x: -16,
										},
									},
								],
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
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
														pointF: {
															Float64: {
																x: -16,
																y: -32,
															},
														},
														pointH: {
															Float64: {
																x: -4,
																y: -8,
															},
														},
														pointI: {
															Float64: {
																x: -2,
																y: -4,
															},
														},
														pointJ: {
															Float64: {
																x: -1,
																y: -2,
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
					queryPaths: [
						"myNodeProperty.myPointsMap.pointF",
						"myNodeProperty.myPointsMap.pointH",
						"myNodeProperty.myPointsMap.pointI",
						"myNodeProperty.myPointsMap.pointJ",
					],
				});
			});
		});
	});

	describe("with a path prefix, string values", () => {
		let changeSet = {
			insert: {
				"map<mysample:person-1.0.0>": {
					myPersonMap: {
						insert: {
							"mysample:person-1.0.0": {
								personA: {
									String: {
										firstName: "Steve",
										lastName: "Austin",
									},
								},
								personB: {
									String: {
										firstName: "Ryan",
										lastName: "Gosling",
									},
								},
								personC: {
									String: {
										firstName: "Erik",
										lastName: "Leifssen",
									},
								},
								personD: {
									String: {
										firstName: "Alan",
										lastName: "Murray",
									},
								},
								personE: {
									String: {
										firstName: "Joseph",
										lastName: "Spalding",
									},
								},
							},
						},
					},
				},
			},
		};

		describe("match clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPersonMap",
							depthLimit: 1,
							where: {
								match: {
									firstName: "n$",
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {
						insert: {
							"map<mysample:person-1.0.0>": {
								myPersonMap: {
									insert: {
										"mysample:person-1.0.0": {
											personB: {
												String: {
													firstName: "Ryan",
													lastName: "Gosling",
												},
											},
											personD: {
												String: {
													firstName: "Alan",
													lastName: "Murray",
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: ["myPersonMap.personB", "myPersonMap.personD"],
				});
			});

			describe("with a non-string value", () => {
				let changeSetWithNumbers = {
					insert: {
						"map<mysample:person-1.0.0>": {
							myPersonMap: {
								insert: {
									"mysample:person-1.0.0": {
										personA: {
											Float32: {
												firstName: 2,
												lastName: 3,
											},
										},
									},
								},
							},
						},
					},
				};

				it("should throw an exception", () => {
					let query = {
						queryLanguage: "queryV1",
						from: [
							{
								pathPrefix: "myPersonMap",
								depthLimit: 1,
								where: {
									match: {
										firstName: "n$",
									},
								},
							},
						],
					};

					return expect(
						InMemoryByValue.filterByValue(query.from[0], changeSetWithNumbers),
					).to.be.rejectedWith(
						OperationError,
						"Attempting to perform regex match on non-string field, type was Float32",
					);
				});
			});
		});
	});

	describe("with a path prefix, with Int64 values", () => {
		let intsX = [new Long(50), new Long(40), new Long(30), new Long(20)];

		let intsY = [new Long(10), new Long(20), new Long(30), new Long(40)];

		let changeSet = {
			insert: {
				"map<mysample:point64-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point64-1.0.0": {
								pointA: {
									Int64: {
										x: [intsX[0].getLowBits(), intsX[0].getHighBits()],
										y: [intsY[0].getLowBits(), intsY[0].getHighBits()],
									},
								},
								pointB: {
									Int64: {
										x: [intsX[1].getLowBits(), intsX[1].getHighBits()],
										y: [intsY[1].getLowBits(), intsY[1].getHighBits()],
									},
								},
								pointC: {
									Int64: {
										x: [intsX[2].getLowBits(), intsX[2].getHighBits()],
										y: [intsY[2].getLowBits(), intsY[2].getHighBits()],
									},
								},
								pointD: {
									Int64: {
										x: [intsX[3].getLowBits(), intsX[3].getHighBits()],
										y: [intsY[3].getLowBits(), intsY[3].getHighBits()],
									},
								},
							},
						},
					},
				},
			},
		};

		describe("in clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								in: {
									x: [
										[intsX[0].getLowBits(), intsX[0].getHighBits()],
										[intsX[2].getLowBits(), intsX[2].getHighBits()],
									],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {
						insert: {
							"map<mysample:point64-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point64-1.0.0": {
											pointA: {
												Int64: {
													x: [intsX[0].getLowBits(), intsX[0].getHighBits()],
													y: [intsY[0].getLowBits(), intsY[0].getHighBits()],
												},
											},
											pointC: {
												Int64: {
													x: [intsX[2].getLowBits(), intsX[2].getHighBits()],
													y: [intsY[2].getLowBits(), intsY[2].getHighBits()],
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: ["myPointsMap.pointA", "myPointsMap.pointC"],
				});
			});
		});

		describe("in clause, with string values", () => {
			it("should return an empty response", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								in: {
									x: ["Paul", "Peter"],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {},
					queryPaths: [],
				});
			});
		});

		describe("lt, gt clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								lt: {
									x: [intsX[1].getLowBits(), intsX[1].getHighBits()],
								},
								gt: {
									y: [intsY[1].getLowBits(), intsY[1].getHighBits()],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {
						insert: {
							"map<mysample:point64-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point64-1.0.0": {
											pointC: {
												Int64: {
													x: [intsX[2].getLowBits(), intsX[2].getHighBits()],
													y: [intsY[2].getLowBits(), intsY[2].getHighBits()],
												},
											},
											pointD: {
												Int64: {
													x: [intsX[3].getLowBits(), intsX[3].getHighBits()],
													y: [intsY[3].getLowBits(), intsY[3].getHighBits()],
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: ["myPointsMap.pointC", "myPointsMap.pointD"],
				});
			});
		});

		describe("gt, lt clause, with string values", () => {
			it("should return an empty response", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								lt: {
									x: "Peter",
								},
								gt: {
									y: "Paul",
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {},
					queryPaths: [],
				});
			});
		});
	});

	describe("with a path prefix, with Uint64 values", () => {
		let intsX = [
			[50, 0],
			[40, 0],
			[30, 0],
			[20, 0],
		];

		let intsY = [
			[10, 0],
			[20, 0],
			[30, 0],
			[40, 0],
		];

		let changeSet = {
			insert: {
				"map<mysample:point64-1.0.0>": {
					myPointsMap: {
						insert: {
							"mysample:point64-1.0.0": {
								pointA: {
									Uint64: {
										x: [intsX[0][0], intsX[0][1]],
										y: [intsY[0][0], intsY[0][1]],
									},
								},
								pointB: {
									Uint64: {
										x: [intsX[1][0], intsX[1][1]],
										y: [intsY[1][0], intsY[1][1]],
									},
								},
								pointC: {
									Uint64: {
										x: [intsX[2][0], intsX[2][1]],
										y: [intsY[2][0], intsY[2][1]],
									},
								},
								pointD: {
									Uint64: {
										x: [intsX[3][0], intsX[3][1]],
										y: [intsY[3][0], intsY[3][1]],
									},
								},
							},
						},
					},
				},
			},
		};

		describe("in clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								in: {
									x: [
										[intsX[0][0], intsX[0][1]],
										[intsX[2][0], intsX[2][1]],
									],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {
						insert: {
							"map<mysample:point64-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point64-1.0.0": {
											pointA: {
												Uint64: {
													x: [intsX[0][0], intsX[0][1]],
													y: [intsY[0][0], intsY[0][1]],
												},
											},
											pointC: {
												Uint64: {
													x: [intsX[2][0], intsX[2][1]],
													y: [intsY[2][0], intsY[2][1]],
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: ["myPointsMap.pointA", "myPointsMap.pointC"],
				});
			});
		});

		describe("in clause with string values", () => {
			it("should return an empty result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								in: {
									x: ["Peter", "Paul"],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {},
					queryPaths: [],
				});
			});
		});

		describe("lt, gt clause", () => {
			it("should return the proper result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								lt: {
									x: [intsX[1][0], intsX[1][1]],
								},
								gt: {
									y: [intsY[1][0], intsY[1][1]],
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {
						insert: {
							"map<mysample:point64-1.0.0>": {
								myPointsMap: {
									insert: {
										"mysample:point64-1.0.0": {
											pointC: {
												Uint64: {
													x: [intsX[2][0], intsX[2][1]],
													y: [intsY[2][0], intsY[2][1]],
												},
											},
											pointD: {
												Uint64: {
													x: [intsX[3][0], intsX[3][1]],
													y: [intsY[3][0], intsY[3][1]],
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: ["myPointsMap.pointC", "myPointsMap.pointD"],
				});
			});
		});

		describe("lt, gt clause with string values", () => {
			it("should return an empty result", async () => {
				let query = {
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "myPointsMap",
							depthLimit: 1,
							where: {
								lt: {
									x: "Peter",
								},
								gt: {
									y: "Paul",
								},
							},
						},
					],
				};

				let result = await InMemoryByValue.filterByValue(query.from[0], changeSet);
				expect(result).to.eql({
					changeSet: {},
					queryPaths: [],
				});
			});
		});
	});
});
