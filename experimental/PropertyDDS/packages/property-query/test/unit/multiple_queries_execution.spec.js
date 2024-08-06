/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint no-unused-expressions: 0 */
const generateGUID = require("@fluid-experimental/property-common").GuidUtils.generateGUID;
const MultipleQueriesExecution = require("../../src/materialized_history_service/query_pipeline/multiple_queries_execution");
const sinon = require("sinon");

describe("Multiple query execution", () => {
	const mockMaterializedHistoryService = {
		getCommitMV: () => {
			throw new Error("One shall not hit the unstubbed");
		},
	};

	const getCommitMVStub = sinon.stub(mockMaterializedHistoryService, "getCommitMV");

	const aQV1Execution = new MultipleQueriesExecution({
		materializedHistoryService: mockMaterializedHistoryService,
	});

	const someBranchInfo = {
		guid: generateGUID(),
		meta: {},
		rootCommitGuid: generateGUID(),
		headCommitGuid: generateGUID(),
		headSequenceNumber: 50,
		created: new Date().toISOString(),
	};

	const someCommitGuid = generateGUID();

	describe("with an invalid query", () => {
		const queries = {
			query: { something: "invalid" },
		};

		it("should reject with a BAD_REQUEST", () =>
			expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, queries))
				.to.be.eventually.rejectedWith("Invalid query")
				.and.to.have.property("statusCode", 400));
	});

	describe("with an invalid queryLanguage", () => {
		it("should reject", () =>
			expect(
				aQV1Execution.execute(someBranchInfo, someCommitGuid, {
					query: [
						{
							queryLanguage: "invalid",
						},
					],
				}),
			)
				.to.be.eventually.rejectedWith(
					'Invalid query 0,queryLanguage: "[0].queryLanguage" must be [queryV1]',
				)
				.and.to.have.property("statusCode", 400));
	});

	describe("with a valid queryLanguage and multiple queries", () => {
		const queries = {
			query: [
				{
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "collectionA",
							typeId: "mysample:point2d-1.0.0",
						},
					],
				},
				{
					queryLanguage: "queryV1",
					from: [
						{
							pathPrefix: "collectionB",
							typeId: "mysample:point2d-1.0.0",
						},
					],
				},
			],
		};

		const resultFromMHSA = {
			changeSet: {
				insert: {
					"map<mysample:point2d-1.0.0>": {
						collectionA: {
							insert: {
								"mysample:point2d-1.0.0": {
									pointA: {
										Float64: {
											x: -16.0,
											y: -32.0,
										},
									},
									pointB: {
										Float64: {
											x: -8.0,
											y: -16.0,
										},
									},
								},
							},
						},
					},
				},
			},
		};

		const resultFromMHSB = {
			changeSet: {
				insert: {
					"map<mysample:point2d-1.0.0>": {
						collectionB: {
							insert: {
								"mysample:point2d-1.0.0": {
									pointC: {
										Float64: {
											x: -16.0,
											y: -32.0,
										},
									},
									pointD: {
										Float64: {
											x: -8.0,
											y: -16.0,
										},
									},
								},
							},
						},
					},
				},
			},
		};

		before(() => {
			getCommitMVStub
				.withArgs({
					guid: someCommitGuid,
					paths: [queries.query[0].from[0].pathPrefix],
					branchGuid: someBranchInfo.guid,
				})
				.resolves(resultFromMHSA);

			getCommitMVStub
				.withArgs({
					guid: someCommitGuid,
					paths: [queries.query[1].from[0].pathPrefix],
					branchGuid: someBranchInfo.guid,
				})
				.resolves(resultFromMHSB);
		});

		after(() => {
			getCommitMVStub.restore();
		});

		it("should return the union of results", () =>
			expect(aQV1Execution.execute(someBranchInfo, someCommitGuid, queries)).to.eventually.eql(
				{
					changeSet: {
						insert: {
							"map<mysample:point2d-1.0.0>": {
								collectionA: {
									insert: {
										"mysample:point2d-1.0.0": {
											pointA: {
												Float64: {
													x: -16.0,
													y: -32.0,
												},
											},
											pointB: {
												Float64: {
													x: -8.0,
													y: -16.0,
												},
											},
										},
									},
								},
								collectionB: {
									insert: {
										"mysample:point2d-1.0.0": {
											pointC: {
												Float64: {
													x: -16.0,
													y: -32.0,
												},
											},
											pointD: {
												Float64: {
													x: -8.0,
													y: -16.0,
												},
											},
										},
									},
								},
							},
						},
					},
					queryPaths: [
						"collectionA[pointA]",
						"collectionA[pointB]",
						"collectionB[pointC]",
						"collectionB[pointD]",
					],
				},
			));
	});
});
