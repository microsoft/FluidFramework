/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint max-nested-callbacks: 0 */

/**
 * @fileoverview In this file, we will test the functions exported by guid_utils.js
 */

import { expect } from "chai";

import { GuidUtils } from "../guidUtils";

const {
	initializeGUIDGenerator,
	generateGUID,
	uint32x4ToGUID,
	guidToUint32x4,
	base64Tobase16,
	base16ToBase64,
	combineGuids,
	isGUID,
} = GuidUtils;

const testGuid = function (re, base64) {
	describe("generateGuid", function () {
		it("should return a GUID", function (done) {
			expect(re.test(generateGUID(base64))).to.equal(true);
			done();
		});
	});
};

const testInitialization = function (firstGuid, base64) {
	describe("initializeGUIDGenerator", function () {
		// WARNING: All the tests below depend on the first it() results.
		let guid1;
		let guid2;

		describe("using seed 0", function () {
			describe("and enforcing it", function () {
				it("should result in correct first GUID", function (done) {
					// Initialize with seed 0, enforce initialization
					initializeGUIDGenerator(0, true);
					guid1 = generateGUID(base64);
					guid2 = generateGUID(base64);
					expect(guid1).to.equal(firstGuid);
					expect(guid2).to.not.equal(firstGuid);
					done();
				});

				it("should replay the same sequence when called again", function (done) {
					// Do it again to confirm that re-initialization does indeed reset the sequence
					// and that the first time was not due to testing order.
					initializeGUIDGenerator(0, true);
					expect(generateGUID(base64)).to.equal(guid1);
					expect(generateGUID(base64)).to.equal(guid2);
					done();
				});
			});
			describe("without enforcing it", function () {
				it("should play a different sequence", function (done) {
					// Attempting to re-initialized an already initialized generator should
					// have no effect on the sequence.
					initializeGUIDGenerator(0);
					expect(generateGUID(base64)).to.not.equal(guid1);
					expect(generateGUID(base64)).to.not.equal(guid2);
					done();
				});
			});
		});

		describe("using 'null' seed and enforcing it", function () {
			it("should results in same sequence as seed 0", function (done) {
				// Do it again to confirm that re-initialization with 'null' is equivalent to zero.
				initializeGUIDGenerator(0, true);
				expect(generateGUID(base64)).to.equal(guid1);
				expect(generateGUID(base64)).to.equal(guid2);
				done();
			});
		});

		describe("using non-zero seed and enforcing it", function () {
			it("should results in a different sequence", function (done) {
				initializeGUIDGenerator(1, true);
				expect(generateGUID(base64)).to.not.equal(guid1);
				expect(generateGUID(base64)).to.not.equal(guid2);
				done();
			});
		});
	});
};

const testCorrectness = function (goodGuid, badGuid) {
	describe("isGUID", function () {
		it("should check if a GUID is valid", function (done) {
			expect(isGUID(goodGuid)).to.equal(true);
			expect(isGUID(badGuid)).to.equal(false);
			done();
		});
	});
};

const testConversion = function (guid, guidArray, base64) {
	describe("guidToUint32x4", function () {
		it("should check that converting a guid to Uint32x4 is correct", function (done) {
			let myGuidArray: any = guidToUint32x4(guid);
			console.log(myGuidArray);
			myGuidArray = Array.prototype.slice.call(myGuidArray);
			expect(myGuidArray).to.eql(guidArray);
			done();
		});
		it("should check that converting a guid to Uint32x4 with parameter array is correct", function (done) {
			let ioResult: any = new Uint32Array(4);
			let myGuidArray: any = guidToUint32x4(guid, ioResult);
			myGuidArray = Array.prototype.slice.call(myGuidArray);
			ioResult = Array.prototype.slice.call(ioResult);
			expect(ioResult).to.eql(myGuidArray);
			done();
		});
	});

	describe("uint32x4ToGuid", function () {
		it("should check that converting a Uint32x4 to guid is correct", function (done) {
			const myGuid = uint32x4ToGUID(guidArray, base64);
			expect(myGuid).to.equal(guid);
			done();
		});
	});

	describe("uint32x4ToGUID and guidToUint32x4", function () {
		it("should check that converting guid to Uint32x4 and back is correct", function (done) {
			const myGuidArray = guidToUint32x4(guid);
			const guid1 = uint32x4ToGUID(myGuidArray, base64);
			expect(guid1).to.equal(guid);
			done();
		});
	});
};

const testCombine = function (guid1, guid2, expectedGuid, base64) {
	describe("combineGuids", function () {
		it("should check that combining two guids will result in an expected guid", function () {
			expect(combineGuids(guid1, guid2, base64)).to.equal(expectedGuid);
		});

		it("should not result in the expected guid if the order of combined guids are reversed", function () {
			expect(combineGuids(guid2, guid1, base64)).to.not.equal(expectedGuid);
		});
	});
};

const test16fromAndTo64 = function (base64, base16) {
	describe("base64Tobase16 and base16ToBase64", function () {
		it("should check that converting a base64 to a GUID is correct", function (done) {
			expect(base16ToBase64(base64Tobase16(base64))).to.equal(base64);
			expect(base64Tobase16(base16ToBase64(base16))).to.equal(base16);
			expect(base16ToBase64(base16)).to.equal(base64);
			expect(base64Tobase16(base64)).to.equal(base16);
			done();
		});
	});
};

describe("Base16", function () {
	testGuid(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i, false);
	testInitialization("492b176c-bdc9-0dec-7c70-087a6a7bdac2", false);
	testCorrectness("893fa0d4-c767-4133-829f-27434bf38cc8", "893fa0d4-c?767-4133-829f-27434b-8");
	testConversion(
		"8aecac9a-45d6-8009-0000-00002c033cfb",
		[2330766490, 1171685385, 0, 738409723],
		false,
	);
	testCombine(
		"4e1170f1-d917-178a-7c8b-dde9b3ba3007",
		"03b1ed90-a03e-a6cc-fed0-abea5fb52530",
		"acd8632c-c214-4fe8-901c-563c0fdbeb12",
		false,
	);
});

describe("Base64", function () {
	testGuid(/^[\w-]{21}[agqw]$/i, true);
	testInitialization("bBcrSewNyb16CHB8wtp7ag", true);
	testCorrectness("mqzsigmA1kUAAAAA-zwDLA", "mqzsigmA1kUAAAAA+zw?5$");
	testCorrectness("--___---___---___0123w", "--___---___---___01234");
	testCorrectness("abcdefgABCDEFG789_-_-w", "abcdefgABCDEFG789_-_-_");
	testCorrectness("abcdffffffDEScvF9_-_-g", "abcdffffffDEScvF9_-_-0");
	testCorrectness("--___---___---___0123Q", "--___---___---___0123a");
	testCorrectness("AAAAAAAAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAA%AAAAAAA");
	testConversion("mqzsigmA1kUAAAAA-zwDLA", [2330766490, 1171685385, 0, 738409723], true);
	testConversion(
		"--___---___---___0123Q",
		[4294963195, 4294950639, 4293917694, 3715517951],
		true,
	);
	testConversion(
		"--___---___---___----g",
		[4294963195, 4294950639, 4293917694, 4206817279],
		true,
	);
	testConversion(
		"---------------------A",
		[4223594491, 4026253039, 3203398590, 4173262843],
		true,
	);
	testConversion("AAAAAAAAAAAAAAAAAAAAAA", [0, 0, 0, 0], true);
	testConversion(
		"_____________________w",
		[4294967295, 4294967295, 4294967295, 4294967295],
		true,
	);
	testConversion(
		"abcdefgABCDEFG789_-_-w",
		[2031990633, 537133304, 4235072708, 4223664119],
		true,
	);
	testConversion(
		"1218LLkdwolw_---__-2ig",
		[746352087, 2311200185, 3203399536, 2327248895],
		true,
	);
	testConversion(
		"aaMHUi2id94292---__-ww",
		[1376232297, 3732382253, 3195008822, 3288268795],
		true,
	);
	testConversion(
		"AKKsksoeoeepoep3883e-Q",
		[2460787200, 3886096074, 2011865513, 4192128499],
		true,
	);
	testConversion(
		"121dsls----_--ww3k339A",
		[2992467415, 4026220123, 820837311, 4109848030],
		true,
	);
	testCombine(
		"AAAAAEJPQgDSBAAAAAAAAA",
		"8aecac9a-45d6-8009-0000-00002c033cfb",
		"IO428cglWJ7Y-mLFMGo9pA",
		true,
	);
	testCombine(
		"AAAAAEJPQgDSBAAAAAAAAA",
		"mqzsigmA1kUAAAAA-zwDLA",
		"IO428cglWJ7Y-mLFMGo9pA",
		true,
	);
	testCombine(
		"AAAAAAAAAAAAAAAAAAAAAA",
		"_____________________w",
		"qJxUydIxpfHEv7ErjBMm8w",
		true,
	);
	testCombine(
		"00000000-0000-0000-0000-000000000000",
		"_____________________w",
		"qJxUydIxpfHEv7ErjBMm8w",
		true,
	);
	testCombine(
		"gggggggggggggggggggggg",
		"---------------------A",
		"XFnCZCBvAg8sJ0TwwNuRQg",
		true,
	);
	testCombine(
		"Uiedk4939itkff-___---A",
		"AKKsksoeoeepoep3883e-Q",
		"aImthHwnGCgQAHhTbFPr4A",
		true,
	);
	testCombine(
		"1218LLkdwolw_---__-2ig",
		"aaMHUi2id94292---__-ww",
		"BZ58EdgKdtckSxx1_NOt1Q",
		true,
	);
	testCombine(
		"AAAAAEJPQgDSBAAAAAAAAA",
		"8aecac9a-45d6-8009-0000-00002c033cfb",
		"IO428cglWJ7Y-mLFMGo9pA",
		true,
	);
	testCombine(
		"4e1170f1-d917-178a-7c8b-dde9b3ba3007",
		"03b1ed90-a03e-a6cc-fed0-abea5fb52530",
		"LGPYrOhPFMI8VhyQEuvbDw",
		true,
	);
	testCombine(
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-8888-9999-0000-aaaaaaaaaaaa",
		"qJxUyUD_rnr1ar7Xvb7QSA",
		true,
	);
});

test16fromAndTo64("mqzsigmA1kUAAAAA-zwDLA", "8aecac9a-45d6-8009-0000-00002c033cfb");
test16fromAndTo64("AAAAAAAAAAAAAAAAAAAAAA", "00000000-0000-0000-0000-000000000000");
test16fromAndTo64("qtqv_f39u7sAq-7uq6urCg", "fdafdaaa-bbbb-fdfd-eeee-ab000aababab");
test16fromAndTo64("_____5mZiIiqqgAAqqqqqg", "ffffffff-8888-9999-0000-aaaaaaaaaaaa");
