/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview In this file, we will test the path helper functions described in /src/properties/path_helper.js
 */

import { expect } from "chai";

import { PathHelper } from "../pathHelper.js";

describe("PathHelper", function () {
	describe("tokenizePathString", function () {
		it("should work for simple paths separated by dots", function () {
			let types = [];
			expect(PathHelper.tokenizePathString("", types)).to.deep.equal([]);
			expect(types).to.deep.equal([]);

			expect(PathHelper.tokenizePathString("test", types)).to.deep.equal(["test"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString("test.test2", types)).to.deep.equal([
				"test",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString(".test2");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("test2.");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString(".");
			}).to.throw();
		});

		it("should work for arrays", function () {
			let types = [];
			expect(PathHelper.tokenizePathString("[test]", types)).to.deep.equal(["test"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.ARRAY_TOKEN]);

			expect(PathHelper.tokenizePathString("[test][test2]", types)).to.deep.equal([
				"test",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString("[");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("[abcd");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("]");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("[abcd]]");
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("[]");
			}).to.throw();
		});

		it("should work for combinations of arrays and paths separated by dots", function () {
			let types = [];
			expect(PathHelper.tokenizePathString("map[test]", types)).to.deep.equal(["map", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("[test].parameter", types)).to.deep.equal([
				"test",
				"parameter",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("map[test].parameter[test2]", types)).to.deep.equal(
				["map", "test", "parameter", "test2"],
			);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString("[test]parameter");
			}).to.throw();
		});

		it("should work for quoted tokens", function () {
			let types = [];
			expect(PathHelper.tokenizePathString('"test"', types)).to.deep.equal(["test"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString('"te\\"st"', types)).to.deep.equal(['te"st']);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString('"te\\\\st"', types)).to.deep.equal(["te\\st"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString('""', types)).to.deep.equal([""]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString('"test1".test2', types)).to.deep.equal([
				"test1",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('"test1"."test2"', types)).to.deep.equal([
				"test1",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('test1."test2"', types)).to.deep.equal([
				"test1",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('test1["test2"]', types)).to.deep.equal([
				"test1",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('"test1"["test2"]', types)).to.deep.equal([
				"test1",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('""[""]', types)).to.deep.equal(["", ""]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString('"/"', types)).to.deep.equal(["/"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN]);

			expect(PathHelper.tokenizePathString("/", types)).to.deep.equal(["/"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN]);

			expect(PathHelper.tokenizePathString("/test", types)).to.deep.equal(["/", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("/[test]", types)).to.deep.equal(["/", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("*", types)).to.deep.equal(["*"]);
			expect(types).to.deep.equal([PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN]);

			expect(PathHelper.tokenizePathString("test*", types)).to.deep.equal(["test", "*"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("*.test", types)).to.deep.equal(["*", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString("*test", types);
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString("test*test", types);
			}).to.throw();

			expect(PathHelper.tokenizePathString("*.test*.test2*", types)).to.deep.equal([
				"*",
				"test",
				"*",
				"test2",
				"*",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("/*", types)).to.deep.equal(["/", "*"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.PATH_ROOT_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("*[test]", types)).to.deep.equal(["*", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("[test]*", types)).to.deep.equal(["test", "*"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("[test]*.test2", types)).to.deep.equal([
				"test",
				"*",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("[test]*[test2]", types)).to.deep.equal([
				"test",
				"*",
				"test2",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.DEREFERENCE_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString("[test]*test", types);
			}).to.throw();

			expect(function () {
				PathHelper.tokenizePathString('"');
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString('test"');
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString('"tests');
			}).to.throw();
			expect(function () {
				PathHelper.tokenizePathString('"\\a"');
			}).to.throw();
		});

		it("should work for relative paths", function () {
			let types = [];
			expect(PathHelper.tokenizePathString("../test", types)).to.deep.equal(["../", "test"]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("../../../test", types)).to.deep.equal([
				"../",
				"../",
				"../",
				"test",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
			]);

			expect(PathHelper.tokenizePathString("../../test[0].test2[key]", types)).to.deep.equal([
				"../",
				"../",
				"test",
				"0",
				"test2",
				"key",
			]);
			expect(types).to.deep.equal([
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.RAISE_LEVEL_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
				PathHelper.TOKEN_TYPES.PATH_SEGMENT_TOKEN,
				PathHelper.TOKEN_TYPES.ARRAY_TOKEN,
			]);

			expect(function () {
				PathHelper.tokenizePathString("/../test2");
			}).to.throw();
		});
	});

	describe("quotePathSegment", function () {
		it("should quote simple strings", function () {
			expect(PathHelper.quotePathSegment("test")).to.equal('"test"');
			expect(JSON.parse(PathHelper.quotePathSegment("test"))).to.equal("test");
		});
		it("should correctly quote strings with a quotation mark", function () {
			expect(PathHelper.quotePathSegment('"')).to.equal('"\\""');
			expect(JSON.parse(PathHelper.quotePathSegment('"'))).to.equal('"');
		});
		it("should correctly quote strings with a backslash", function () {
			expect(PathHelper.quotePathSegment("\\")).to.equal('"\\\\"');
			expect(JSON.parse(PathHelper.quotePathSegment("\\"))).to.equal("\\");
		});

		it("should work for paths with multiple occurrences of the test string", function () {
			expect(PathHelper.quotePathSegment('test"property"')).to.equal('"test\\"property\\""');
			expect(PathHelper.quotePathSegment("test\\property\\")).to.equal(
				'"test\\\\property\\\\"',
			);
			expect(PathHelper.quotePathSegment('test"\\property\\"')).to.equal(
				'"test\\"\\\\property\\\\\\""',
			);
		});
	});

	describe("quotePathSegmentIfNeeded", function () {
		it("should quote all required strings", function () {
			expect(PathHelper.quotePathSegmentIfNeeded(".")).to.equal('"."');
			expect(PathHelper.quotePathSegmentIfNeeded('"')).to.equal('"\\""');
			expect(PathHelper.quotePathSegmentIfNeeded("\\")).to.equal('"\\\\"');
			expect(PathHelper.quotePathSegmentIfNeeded("[")).to.equal('"["');
			expect(PathHelper.quotePathSegmentIfNeeded("]")).to.equal('"]"');
			expect(PathHelper.quotePathSegmentIfNeeded("")).to.equal('""');
			expect(PathHelper.quotePathSegmentIfNeeded("/")).to.equal('"/"');
			expect(PathHelper.quotePathSegmentIfNeeded("*")).to.equal('"*"');
		});

		it("should not quote other strings", function () {
			expect(PathHelper.quotePathSegmentIfNeeded("abcd")).to.equal("abcd");
			expect(PathHelper.quotePathSegmentIfNeeded("test_string")).to.equal("test_string");
		});
	});

	describe("unquotePathSegment", function () {
		it("should unquote simple strings", function () {
			expect(PathHelper.unquotePathSegment('"test"')).to.equal("test");
		});

		it("should correctly unquote strings with a quotation mark", function () {
			expect(PathHelper.unquotePathSegment('"\\""')).to.equal('"');
		});

		it("should correctly unquote strings with a backslash", function () {
			expect(PathHelper.unquotePathSegment('"\\\\"')).to.equal("\\");
		});

		it("should work with empty strings", function () {
			expect(PathHelper.unquotePathSegment("")).to.equal("");
		});

		it("should throw on non strings", function () {
			// @ts-ignore
			expect(() => PathHelper.unquotePathSegment(5)).to.throw();
		});

		it("should work for paths with multiple occurrences of the test string", function () {
			expect(PathHelper.unquotePathSegment('"test\\"property\\""')).to.equal('test"property"');
			expect(PathHelper.unquotePathSegment('"test\\\\property\\\\"')).to.equal(
				"test\\property\\",
			);
			expect(PathHelper.unquotePathSegment('"test\\"\\\\property\\\\\\""')).to.equal(
				'test"\\property\\"',
			);
		});
	});

	describe("convertAbsolutePathToCanonical", function () {
		it("should remove leading /", function () {
			expect(PathHelper.convertAbsolutePathToCanonical("/a.b.c")).to.equal("a.b.c");
		});

		it("should throw on ../", function () {
			expect(() => PathHelper.convertAbsolutePathToCanonical("../a.b.c")).to.throw("../");
		});

		it("should throw on *", function () {
			expect(() => PathHelper.convertAbsolutePathToCanonical("/a.b.c*")).to.throw("*");
		});

		it("should replace square brackets by periods", function () {
			expect(PathHelper.convertAbsolutePathToCanonical("/a.b[c]")).to.equal("a.b.c");
			expect(PathHelper.convertAbsolutePathToCanonical("/a[b].c")).to.equal("a.b.c");
		});

		it("should keep properly escaped property names", function () {
			expect(PathHelper.convertAbsolutePathToCanonical('"."')).to.equal('"."');
			expect(PathHelper.convertAbsolutePathToCanonical('"\\""')).to.equal('"\\""');
			expect(PathHelper.convertAbsolutePathToCanonical('"\\\\"')).to.equal('"\\\\"');
			expect(PathHelper.convertAbsolutePathToCanonical('"["')).to.equal('"["');
			expect(PathHelper.convertAbsolutePathToCanonical('"]"')).to.equal('"]"');
			expect(PathHelper.convertAbsolutePathToCanonical('""')).to.equal('""');
			expect(PathHelper.convertAbsolutePathToCanonical('"/"')).to.equal('"/"');
			expect(PathHelper.convertAbsolutePathToCanonical('"*"')).to.equal('"*"');
		});

		it("should properly unescape unusually escaped property names", function () {
			expect(PathHelper.convertAbsolutePathToCanonical('"a"."b"')).to.equal("a.b");
			expect(PathHelper.convertAbsolutePathToCanonical('"a"[b]["c"]')).to.equal("a.b.c");
		});

		it("should not modify simple paths", function () {
			expect(PathHelper.convertAbsolutePathToCanonical("a.b.c.d")).to.equal("a.b.c.d");
			expect(PathHelper.convertAbsolutePathToCanonical("test_string")).to.equal("test_string");
		});
	});

	describe("getPathCoverage", function () {
		this.timeout(500);
		let paths;

		it("should succeed if property is included in a path 1", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("a.b", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.FULLY_COVERED);
			expect(res.pathList).to.deep.equal(["a.b"]);
		});

		it("should succeed if property is included in a path 2", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("a.b.c", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.FULLY_COVERED);
			expect(res.pathList).to.deep.equal(["a.b"]);
		});

		it("should succeed if property is included in a path 3", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("a.b.c.d", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.FULLY_COVERED);
			expect(res.pathList).to.deep.equal(["a.b"]);
		});

		it("should fail if property is not included in any path 1", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("b", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.UNCOVERED);
			expect(res.pathList).to.deep.equal([]);
		});

		it("should fail if property is not included in any path 2", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("b.f.g", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.UNCOVERED);
			expect(res.pathList).to.deep.equal([]);
		});

		it("should fail if property is not included in any path but have common root 1", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("a.h", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.UNCOVERED);
			expect(res.pathList).to.deep.equal([]);
		});

		it("should fail if property is not included in any path but have common root 2", function () {
			paths = ["a.b"];
			const res = PathHelper.getPathCoverage("a.i.j", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.UNCOVERED);
			expect(res.pathList).to.deep.equal([]);
		});

		it("should succeed if path goes through the property 1", function () {
			paths = ["a.b.c", "a.b.d", "z"];
			const res = PathHelper.getPathCoverage("a.b", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.PARTLY_COVERED);
			expect(res.pathList).to.deep.equal(["a.b.c", "a.b.d"]);
		});

		it("should succeed if path goes through the property 2", function () {
			paths = ["z", "a.b.c", "a.b.d"];
			const res = PathHelper.getPathCoverage("a.b", paths);
			expect(res.coverageExtent).to.equal(PathHelper.CoverageExtent.PARTLY_COVERED);
			expect(res.pathList).to.deep.equal(["a.b.c", "a.b.d"]);
		});
	});
});
