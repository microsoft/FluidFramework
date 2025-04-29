/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/require-jsdoc */

import {
	SchemaFactory,
	TreeViewConfiguration,
	type FixRecursiveRecursionLimit,
	type ValidateRecursiveSchema,
	allowUnused,
} from "@fluidframework/tree/alpha";

const schema = new SchemaFactory("com.example");

const largeUnionInternal = [
	() => Empty199,
	() => Empty198,
	() => Empty197,
	() => Empty196,
	() => Empty195,
	() => Empty194,
	() => Empty193,
	() => Empty192,
	() => Empty191,
	() => Empty190,
	() => Empty189,
	() => Empty188,
	() => Empty187,
	() => Empty186,
	() => Empty185,
	() => Empty184,
	() => Empty183,
	() => Empty182,
	() => Empty181,
	() => Empty180,
	() => Empty179,
	() => Empty178,
	() => Empty177,
	() => Empty176,
	() => Empty175,
	() => Empty174,
	() => Empty173,
	() => Empty172,
	() => Empty171,
	() => Empty170,
	() => Empty169,
	() => Empty168,
	() => Empty167,
	() => Empty166,
	() => Empty165,
	() => Empty164,
	() => Empty163,
	() => Empty162,
	() => Empty161,
	() => Empty160,
	() => Empty159,
	() => Empty158,
	() => Empty157,
	() => Empty156,
	() => Empty155,
	() => Empty154,
	() => Empty153,
	() => Empty152,
	() => Empty151,
	() => Empty150,
	() => Empty149,
	() => Empty148,
	() => Empty147,
	() => Empty146,
	() => Empty145,
	() => Empty144,
	() => Empty143,
	() => Empty142,
	() => Empty141,
	() => Empty140,
	() => Empty139,
	() => Empty138,
	() => Empty137,
	() => Empty136,
	() => Empty135,
	() => Empty134,
	() => Empty133,
	() => Empty132,
	() => Empty131,
	() => Empty130,
	() => Empty129,
	() => Empty128,
	() => Empty127,
	() => Empty126,
	() => Empty125,
	() => Empty124,
	() => Empty123,
	() => Empty122,
	() => Empty121,
	() => Empty120,
	() => Empty119,
	() => Empty118,
	() => Empty117,
	() => Empty116,
	() => Empty115,
	() => Empty114,
	() => Empty113,
	() => Empty112,
	() => Empty111,
	() => Empty110,
	() => Empty109,
	() => Empty108,
	() => Empty107,
	() => Empty106,
	() => Empty105,
	() => Empty104,
	() => Empty103,
	() => Empty102,
	() => Empty101,
	() => Empty100,
	() => Empty099,
	() => Empty098,
	() => Empty097,
	() => Empty096,
	() => Empty095,
	() => Empty094,
	() => Empty093,
	() => Empty092,
	() => Empty091,
	() => Empty090,
	() => Empty089,
	() => Empty088,
	() => Empty087,
	() => Empty086,
	() => Empty085,
	() => Empty084,
	() => Empty083,
	() => Empty082,
	() => Empty081,
	() => Empty080,
	() => Empty079,
	() => Empty078,
	() => Empty077,
	() => Empty076,
	() => Empty075,
	() => Empty074,
	() => Empty073,
	() => Empty072,
	() => Empty071,
	() => Empty070,
	() => Empty069,
	() => Empty068,
	() => Empty067,
	() => Empty066,
	() => Empty065,
	() => Empty064,
	() => Empty063,
	() => Empty062,
	() => Empty061,
	() => Empty060,
	() => Empty059,
	() => Empty058,
	() => Empty057,
	() => Empty056,
	() => Empty055,
	() => Empty054,
	() => Empty053,
	() => Empty052,
	() => Empty051,
	() => Empty050,
	() => Empty049,
	() => Empty048,
	() => Empty047,
	() => Empty046,
	() => Empty045,
	() => Empty044,
	() => Empty043,
	() => Empty042,
	() => Empty041,
	() => Empty040,
	() => Empty039,
	() => Empty038,
	() => Empty037,
	() => Empty036,
	() => Empty035,
	() => Empty034,
	() => Empty033,
	() => Empty032,
	() => Empty031,
	() => Empty030,
	() => Empty029,
	() => Empty028,
	() => Empty027,
	() => Empty026,
	() => Empty025,
	() => Empty024,
	() => Empty023,
	() => Empty022,
	() => Empty021,
	() => Empty020,
	() => Empty019,
	() => Empty018,
	() => Empty017,
	() => Empty016,
	() => Empty015,
	() => Empty014,
	() => Empty013,
	() => Empty012,
	() => Empty011,
	() => Empty010,
	() => Empty009,
	() => Empty008,
	() => Empty007,
	() => Empty006,
	() => Empty005,
	() => Empty004,
	() => Empty003,
	() => Empty002,
	() => Empty001,
	() => Empty000,
] as const;

export interface LargeUnionHolder {
	readonly largeUnion: typeof largeUnionInternal;
}

export type LargeUnion<T = 0> = T extends 0 ? LargeUnionHolder["largeUnion"] : false;
export const largeUnion: LargeUnion = largeUnionInternal;

export class Empty199 extends schema.objectRecursive("199", { x: largeUnion }) {}
export class Empty198 extends schema.objectRecursive("198", { x: largeUnion }) {}
export class Empty197 extends schema.objectRecursive("197", { x: largeUnion }) {}
export class Empty196 extends schema.objectRecursive("196", { x: largeUnion }) {}
export class Empty195 extends schema.objectRecursive("195", { x: largeUnion }) {}
export class Empty194 extends schema.objectRecursive("194", { x: largeUnion }) {}
export class Empty193 extends schema.objectRecursive("193", { x: largeUnion }) {}
export class Empty192 extends schema.objectRecursive("192", { x: largeUnion }) {}
export class Empty191 extends schema.objectRecursive("191", { x: largeUnion }) {}
export class Empty190 extends schema.objectRecursive("190", { x: largeUnion }) {}
export class Empty189 extends schema.objectRecursive("189", { x: largeUnion }) {}
export class Empty188 extends schema.objectRecursive("188", { x: largeUnion }) {}
export class Empty187 extends schema.objectRecursive("187", { x: largeUnion }) {}
export class Empty186 extends schema.objectRecursive("186", { x: largeUnion }) {}
export class Empty185 extends schema.objectRecursive("185", { x: largeUnion }) {}
export class Empty184 extends schema.objectRecursive("184", { x: largeUnion }) {}
export class Empty183 extends schema.objectRecursive("183", { x: largeUnion }) {}
export class Empty182 extends schema.objectRecursive("182", { x: largeUnion }) {}
export class Empty181 extends schema.objectRecursive("181", { x: largeUnion }) {}
export class Empty180 extends schema.objectRecursive("180", { x: largeUnion }) {}
export class Empty179 extends schema.objectRecursive("179", { x: largeUnion }) {}
export class Empty178 extends schema.objectRecursive("178", { x: largeUnion }) {}
export class Empty177 extends schema.objectRecursive("177", { x: largeUnion }) {}
export class Empty176 extends schema.objectRecursive("176", { x: largeUnion }) {}
export class Empty175 extends schema.objectRecursive("175", { x: largeUnion }) {}
export class Empty174 extends schema.objectRecursive("174", { x: largeUnion }) {}
export class Empty173 extends schema.objectRecursive("173", { x: largeUnion }) {}
export class Empty172 extends schema.objectRecursive("172", { x: largeUnion }) {}
export class Empty171 extends schema.objectRecursive("171", { x: largeUnion }) {}
export class Empty170 extends schema.objectRecursive("170", { x: largeUnion }) {}
export class Empty169 extends schema.objectRecursive("169", { x: largeUnion }) {}
export class Empty168 extends schema.objectRecursive("168", { x: largeUnion }) {}
export class Empty167 extends schema.objectRecursive("167", { x: largeUnion }) {}
export class Empty166 extends schema.objectRecursive("166", { x: largeUnion }) {}
export class Empty165 extends schema.objectRecursive("165", { x: largeUnion }) {}
export class Empty164 extends schema.objectRecursive("164", { x: largeUnion }) {}
export class Empty163 extends schema.objectRecursive("163", { x: largeUnion }) {}
export class Empty162 extends schema.objectRecursive("162", { x: largeUnion }) {}
export class Empty161 extends schema.objectRecursive("161", { x: largeUnion }) {}
export class Empty160 extends schema.objectRecursive("160", { x: largeUnion }) {}
export class Empty159 extends schema.objectRecursive("159", { x: largeUnion }) {}
export class Empty158 extends schema.objectRecursive("158", { x: largeUnion }) {}
export class Empty157 extends schema.objectRecursive("157", { x: largeUnion }) {}
export class Empty156 extends schema.objectRecursive("156", { x: largeUnion }) {}
export class Empty155 extends schema.objectRecursive("155", { x: largeUnion }) {}
export class Empty154 extends schema.objectRecursive("154", { x: largeUnion }) {}
export class Empty153 extends schema.objectRecursive("153", { x: largeUnion }) {}
export class Empty152 extends schema.objectRecursive("152", { x: largeUnion }) {}
export class Empty151 extends schema.objectRecursive("151", { x: largeUnion }) {}
export class Empty150 extends schema.objectRecursive("150", { x: largeUnion }) {}
export class Empty149 extends schema.objectRecursive("149", { x: largeUnion }) {}
export class Empty148 extends schema.objectRecursive("148", { x: largeUnion }) {}
export class Empty147 extends schema.objectRecursive("147", { x: largeUnion }) {}
export class Empty146 extends schema.objectRecursive("146", { x: largeUnion }) {}
export class Empty145 extends schema.objectRecursive("145", { x: largeUnion }) {}
export class Empty144 extends schema.objectRecursive("144", { x: largeUnion }) {}
export class Empty143 extends schema.objectRecursive("143", { x: largeUnion }) {}
export class Empty142 extends schema.objectRecursive("142", { x: largeUnion }) {}
export class Empty141 extends schema.objectRecursive("141", { x: largeUnion }) {}
export class Empty140 extends schema.objectRecursive("140", { x: largeUnion }) {}
export class Empty139 extends schema.objectRecursive("139", { x: largeUnion }) {}
export class Empty138 extends schema.objectRecursive("138", { x: largeUnion }) {}
export class Empty137 extends schema.objectRecursive("137", { x: largeUnion }) {}
export class Empty136 extends schema.objectRecursive("136", { x: largeUnion }) {}
export class Empty135 extends schema.objectRecursive("135", { x: largeUnion }) {}
export class Empty134 extends schema.objectRecursive("134", { x: largeUnion }) {}
export class Empty133 extends schema.objectRecursive("133", { x: largeUnion }) {}
export class Empty132 extends schema.objectRecursive("132", { x: largeUnion }) {}
export class Empty131 extends schema.objectRecursive("131", { x: largeUnion }) {}
export class Empty130 extends schema.objectRecursive("130", { x: largeUnion }) {}
export class Empty129 extends schema.objectRecursive("129", { x: largeUnion }) {}
export class Empty128 extends schema.objectRecursive("128", { x: largeUnion }) {}
export class Empty127 extends schema.objectRecursive("127", { x: largeUnion }) {}
export class Empty126 extends schema.objectRecursive("126", { x: largeUnion }) {}
export class Empty125 extends schema.objectRecursive("125", { x: largeUnion }) {}
export class Empty124 extends schema.objectRecursive("124", { x: largeUnion }) {}
export class Empty123 extends schema.objectRecursive("123", { x: largeUnion }) {}
export class Empty122 extends schema.objectRecursive("122", { x: largeUnion }) {}
export class Empty121 extends schema.objectRecursive("121", { x: largeUnion }) {}
export class Empty120 extends schema.objectRecursive("120", { x: largeUnion }) {}
export class Empty119 extends schema.objectRecursive("119", { x: largeUnion }) {}
export class Empty118 extends schema.objectRecursive("118", { x: largeUnion }) {}
export class Empty117 extends schema.objectRecursive("117", { x: largeUnion }) {}
export class Empty116 extends schema.objectRecursive("116", { x: largeUnion }) {}
export class Empty115 extends schema.objectRecursive("115", { x: largeUnion }) {}
export class Empty114 extends schema.objectRecursive("114", { x: largeUnion }) {}
export class Empty113 extends schema.objectRecursive("113", { x: largeUnion }) {}
export class Empty112 extends schema.objectRecursive("112", { x: largeUnion }) {}
export class Empty111 extends schema.objectRecursive("111", { x: largeUnion }) {}
export class Empty110 extends schema.objectRecursive("110", { x: largeUnion }) {}
export class Empty109 extends schema.objectRecursive("109", { x: largeUnion }) {}
export class Empty108 extends schema.objectRecursive("108", { x: largeUnion }) {}
export class Empty107 extends schema.objectRecursive("107", { x: largeUnion }) {}
export class Empty106 extends schema.objectRecursive("106", { x: largeUnion }) {}
export class Empty105 extends schema.objectRecursive("105", { x: largeUnion }) {}
export class Empty104 extends schema.objectRecursive("104", { x: largeUnion }) {}
export class Empty103 extends schema.objectRecursive("103", { x: largeUnion }) {}
export class Empty102 extends schema.objectRecursive("102", { x: largeUnion }) {}
export class Empty101 extends schema.objectRecursive("101", { x: largeUnion }) {}
export class Empty100 extends schema.objectRecursive("100", { x: largeUnion }) {}

export class Empty099 extends schema.objectRecursive("099", { x: largeUnion }) {}
export class Empty098 extends schema.objectRecursive("098", { x: largeUnion }) {}
export class Empty097 extends schema.objectRecursive("097", { x: largeUnion }) {}
export class Empty096 extends schema.objectRecursive("096", { x: largeUnion }) {}
export class Empty095 extends schema.objectRecursive("095", { x: largeUnion }) {}
export class Empty094 extends schema.objectRecursive("094", { x: largeUnion }) {}
export class Empty093 extends schema.objectRecursive("093", { x: largeUnion }) {}
export class Empty092 extends schema.objectRecursive("092", { x: largeUnion }) {}
export class Empty091 extends schema.objectRecursive("091", { x: largeUnion }) {}
export class Empty090 extends schema.objectRecursive("090", { x: largeUnion }) {}
export class Empty089 extends schema.objectRecursive("089", { x: largeUnion }) {}
export class Empty088 extends schema.objectRecursive("088", { x: largeUnion }) {}
export class Empty087 extends schema.objectRecursive("087", { x: largeUnion }) {}
export class Empty086 extends schema.objectRecursive("086", { x: largeUnion }) {}
export class Empty085 extends schema.objectRecursive("085", { x: largeUnion }) {}
export class Empty084 extends schema.objectRecursive("084", { x: largeUnion }) {}
export class Empty083 extends schema.objectRecursive("083", { x: largeUnion }) {}
export class Empty082 extends schema.objectRecursive("082", { x: largeUnion }) {}
export class Empty081 extends schema.objectRecursive("081", { x: largeUnion }) {}
export class Empty080 extends schema.objectRecursive("080", { x: largeUnion }) {}
export class Empty079 extends schema.objectRecursive("079", { x: largeUnion }) {}
export class Empty078 extends schema.objectRecursive("078", { x: largeUnion }) {}
export class Empty077 extends schema.objectRecursive("077", { x: largeUnion }) {}
export class Empty076 extends schema.objectRecursive("076", { x: largeUnion }) {}
export class Empty075 extends schema.objectRecursive("075", { x: largeUnion }) {}
export class Empty074 extends schema.objectRecursive("074", { x: largeUnion }) {}
export class Empty073 extends schema.objectRecursive("073", { x: largeUnion }) {}
export class Empty072 extends schema.objectRecursive("072", { x: largeUnion }) {}
export class Empty071 extends schema.objectRecursive("071", { x: largeUnion }) {}
export class Empty070 extends schema.objectRecursive("070", { x: largeUnion }) {}
export class Empty069 extends schema.objectRecursive("069", { x: largeUnion }) {}
export class Empty068 extends schema.objectRecursive("068", { x: largeUnion }) {}
export class Empty067 extends schema.objectRecursive("067", { x: largeUnion }) {}
export class Empty066 extends schema.objectRecursive("066", { x: largeUnion }) {}
export class Empty065 extends schema.objectRecursive("065", { x: largeUnion }) {}
export class Empty064 extends schema.objectRecursive("064", { x: largeUnion }) {}
export class Empty063 extends schema.objectRecursive("063", { x: largeUnion }) {}
export class Empty062 extends schema.objectRecursive("062", { x: largeUnion }) {}
export class Empty061 extends schema.objectRecursive("061", { x: largeUnion }) {}
export class Empty060 extends schema.objectRecursive("060", { x: largeUnion }) {}
export class Empty059 extends schema.objectRecursive("059", { x: largeUnion }) {}
export class Empty058 extends schema.objectRecursive("058", { x: largeUnion }) {}
export class Empty057 extends schema.objectRecursive("057", { x: largeUnion }) {}
export class Empty056 extends schema.objectRecursive("056", { x: largeUnion }) {}
export class Empty055 extends schema.objectRecursive("055", { x: largeUnion }) {}
export class Empty054 extends schema.objectRecursive("054", { x: largeUnion }) {}
export class Empty053 extends schema.objectRecursive("053", { x: largeUnion }) {}
export class Empty052 extends schema.objectRecursive("052", { x: largeUnion }) {}
export class Empty051 extends schema.objectRecursive("051", { x: largeUnion }) {}
export class Empty050 extends schema.objectRecursive("050", { x: largeUnion }) {}
export class Empty049 extends schema.objectRecursive("049", { x: largeUnion }) {}
export class Empty048 extends schema.objectRecursive("048", { x: largeUnion }) {}
export class Empty047 extends schema.objectRecursive("047", { x: largeUnion }) {}
export class Empty046 extends schema.objectRecursive("046", { x: largeUnion }) {}
export class Empty045 extends schema.objectRecursive("045", { x: largeUnion }) {}
export class Empty044 extends schema.objectRecursive("044", { x: largeUnion }) {}
export class Empty043 extends schema.objectRecursive("043", { x: largeUnion }) {}
export class Empty042 extends schema.objectRecursive("042", { x: largeUnion }) {}
export class Empty041 extends schema.objectRecursive("041", { x: largeUnion }) {}
export class Empty040 extends schema.objectRecursive("040", { x: largeUnion }) {}
export class Empty039 extends schema.objectRecursive("039", { x: largeUnion }) {}
export class Empty038 extends schema.objectRecursive("038", { x: largeUnion }) {}
export class Empty037 extends schema.objectRecursive("037", { x: largeUnion }) {}
export class Empty036 extends schema.objectRecursive("036", { x: largeUnion }) {}
export class Empty035 extends schema.objectRecursive("035", { x: largeUnion }) {}
export class Empty034 extends schema.objectRecursive("034", { x: largeUnion }) {}
export class Empty033 extends schema.objectRecursive("033", { x: largeUnion }) {}
export class Empty032 extends schema.objectRecursive("032", { x: largeUnion }) {}
export class Empty031 extends schema.objectRecursive("031", { x: largeUnion }) {}
export class Empty030 extends schema.objectRecursive("030", { x: largeUnion }) {}
export class Empty029 extends schema.objectRecursive("029", { x: largeUnion }) {}
export class Empty028 extends schema.objectRecursive("028", { x: largeUnion }) {}
export class Empty027 extends schema.objectRecursive("027", { x: largeUnion }) {}
export class Empty026 extends schema.objectRecursive("026", { x: largeUnion }) {}
export class Empty025 extends schema.objectRecursive("025", { x: largeUnion }) {}
export class Empty024 extends schema.objectRecursive("024", { x: largeUnion }) {}
export class Empty023 extends schema.objectRecursive("023", { x: largeUnion }) {}
export class Empty022 extends schema.objectRecursive("022", { x: largeUnion }) {}
export class Empty021 extends schema.objectRecursive("021", { x: largeUnion }) {}
export class Empty020 extends schema.objectRecursive("020", { x: largeUnion }) {}
export class Empty019 extends schema.objectRecursive("019", { x: largeUnion }) {}
export class Empty018 extends schema.objectRecursive("018", { x: largeUnion }) {}
export class Empty017 extends schema.objectRecursive("017", { x: largeUnion }) {}
export class Empty016 extends schema.objectRecursive("016", { x: largeUnion }) {}
export class Empty015 extends schema.objectRecursive("015", { x: largeUnion }) {}
export class Empty014 extends schema.objectRecursive("014", { x: largeUnion }) {}
export class Empty013 extends schema.objectRecursive("013", { x: largeUnion }) {}
export class Empty012 extends schema.objectRecursive("012", { x: largeUnion }) {}
export class Empty011 extends schema.objectRecursive("011", { x: largeUnion }) {}
export class Empty010 extends schema.objectRecursive("010", { x: largeUnion }) {}
export class Empty009 extends schema.objectRecursive("009", { x: largeUnion }) {}
export class Empty008 extends schema.objectRecursive("008", { x: largeUnion }) {}
export class Empty007 extends schema.objectRecursive("007", { x: largeUnion }) {}
export class Empty006 extends schema.objectRecursive("006", { x: largeUnion }) {}
export class Empty005 extends schema.objectRecursive("005", { x: largeUnion }) {}
export class Empty004 extends schema.objectRecursive("004", { x: largeUnion }) {}
export class Empty003 extends schema.objectRecursive("003", { x: largeUnion }) {}
export class Empty002 extends schema.objectRecursive("002", { x: largeUnion }) {}
export class Empty001 extends schema.objectRecursive("001", { x: largeUnion }) {}
export class Empty000 extends schema.objectRecursive("000", { x: largeUnion }) {}

// This is enough if not exported and imported.
// @ts-expect-error Recursion limit
allowUnused<FixRecursiveRecursionLimit<typeof Empty000>>();
allowUnused<FixRecursiveRecursionLimit<typeof Empty000>>();
allowUnused<ValidateRecursiveSchema<typeof Empty000>>();

// This fails if the ValidateRecursiveSchema above is removed.
export class LargeUnionObjectNode extends schema.object("ObjectNode", { x: largeUnion }) {}
const config = new TreeViewConfiguration({
	schema: LargeUnionObjectNode,
	enableSchemaValidation: true,
});
