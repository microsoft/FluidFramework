/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaFactory,
	TreeViewConfiguration,
	type FixRecursiveRecursionLimit,
	type ImplicitFieldSchema,
	type ValidateRecursiveSchema,
} from "../../simple-tree/index.js";

// Test the limits of how large/deep a schema can be before hitting TypeScript compiler limits.
// For large schema, TypeScript can report "Type instantiation is excessively deep and possibly infinite.ts(2589)":
// These tests ensure that large schema remain supported and don't hit this limit too early.

describe("largeSchema", () => {
	it("deep object", () => {
		// Very deep object schema seem to work fine.
		// This is deep enough that it is likely apps won't run into issue and the true limit does not need to be checked.

		const schema = new SchemaFactory("com.example");

		class Depth499 extends schema.object("Depth499", { x: schema.null }) {}
		class Depth498 extends schema.object("Depth498", { x: Depth499 }) {}
		class Depth497 extends schema.object("Depth497", { x: Depth498 }) {}
		class Depth496 extends schema.object("Depth496", { x: Depth497 }) {}
		class Depth495 extends schema.object("Depth495", { x: Depth496 }) {}
		class Depth494 extends schema.object("Depth494", { x: Depth495 }) {}
		class Depth493 extends schema.object("Depth493", { x: Depth494 }) {}
		class Depth492 extends schema.object("Depth492", { x: Depth493 }) {}
		class Depth491 extends schema.object("Depth491", { x: Depth492 }) {}
		class Depth490 extends schema.object("Depth490", { x: Depth491 }) {}
		class Depth489 extends schema.object("Depth489", { x: Depth490 }) {}
		class Depth488 extends schema.object("Depth488", { x: Depth489 }) {}
		class Depth487 extends schema.object("Depth487", { x: Depth488 }) {}
		class Depth486 extends schema.object("Depth486", { x: Depth487 }) {}
		class Depth485 extends schema.object("Depth485", { x: Depth486 }) {}
		class Depth484 extends schema.object("Depth484", { x: Depth485 }) {}
		class Depth483 extends schema.object("Depth483", { x: Depth484 }) {}
		class Depth482 extends schema.object("Depth482", { x: Depth483 }) {}
		class Depth481 extends schema.object("Depth481", { x: Depth482 }) {}
		class Depth480 extends schema.object("Depth480", { x: Depth481 }) {}
		class Depth479 extends schema.object("Depth479", { x: Depth480 }) {}
		class Depth478 extends schema.object("Depth478", { x: Depth479 }) {}
		class Depth477 extends schema.object("Depth477", { x: Depth478 }) {}
		class Depth476 extends schema.object("Depth476", { x: Depth477 }) {}
		class Depth475 extends schema.object("Depth475", { x: Depth476 }) {}
		class Depth474 extends schema.object("Depth474", { x: Depth475 }) {}
		class Depth473 extends schema.object("Depth473", { x: Depth474 }) {}
		class Depth472 extends schema.object("Depth472", { x: Depth473 }) {}
		class Depth471 extends schema.object("Depth471", { x: Depth472 }) {}
		class Depth470 extends schema.object("Depth470", { x: Depth471 }) {}
		class Depth469 extends schema.object("Depth469", { x: Depth470 }) {}
		class Depth468 extends schema.object("Depth468", { x: Depth469 }) {}
		class Depth467 extends schema.object("Depth467", { x: Depth468 }) {}
		class Depth466 extends schema.object("Depth466", { x: Depth467 }) {}
		class Depth465 extends schema.object("Depth465", { x: Depth466 }) {}
		class Depth464 extends schema.object("Depth464", { x: Depth465 }) {}
		class Depth463 extends schema.object("Depth463", { x: Depth464 }) {}
		class Depth462 extends schema.object("Depth462", { x: Depth463 }) {}
		class Depth461 extends schema.object("Depth461", { x: Depth462 }) {}
		class Depth460 extends schema.object("Depth460", { x: Depth461 }) {}
		class Depth459 extends schema.object("Depth459", { x: Depth460 }) {}
		class Depth458 extends schema.object("Depth458", { x: Depth459 }) {}
		class Depth457 extends schema.object("Depth457", { x: Depth458 }) {}
		class Depth456 extends schema.object("Depth456", { x: Depth457 }) {}
		class Depth455 extends schema.object("Depth455", { x: Depth456 }) {}
		class Depth454 extends schema.object("Depth454", { x: Depth455 }) {}
		class Depth453 extends schema.object("Depth453", { x: Depth454 }) {}
		class Depth452 extends schema.object("Depth452", { x: Depth453 }) {}
		class Depth451 extends schema.object("Depth451", { x: Depth452 }) {}
		class Depth450 extends schema.object("Depth450", { x: Depth451 }) {}
		class Depth449 extends schema.object("Depth449", { x: Depth450 }) {}
		class Depth448 extends schema.object("Depth448", { x: Depth449 }) {}
		class Depth447 extends schema.object("Depth447", { x: Depth448 }) {}
		class Depth446 extends schema.object("Depth446", { x: Depth447 }) {}
		class Depth445 extends schema.object("Depth445", { x: Depth446 }) {}
		class Depth444 extends schema.object("Depth444", { x: Depth445 }) {}
		class Depth443 extends schema.object("Depth443", { x: Depth444 }) {}
		class Depth442 extends schema.object("Depth442", { x: Depth443 }) {}
		class Depth441 extends schema.object("Depth441", { x: Depth442 }) {}
		class Depth440 extends schema.object("Depth440", { x: Depth441 }) {}
		class Depth439 extends schema.object("Depth439", { x: Depth440 }) {}
		class Depth438 extends schema.object("Depth438", { x: Depth439 }) {}
		class Depth437 extends schema.object("Depth437", { x: Depth438 }) {}
		class Depth436 extends schema.object("Depth436", { x: Depth437 }) {}
		class Depth435 extends schema.object("Depth435", { x: Depth436 }) {}
		class Depth434 extends schema.object("Depth434", { x: Depth435 }) {}
		class Depth433 extends schema.object("Depth433", { x: Depth434 }) {}
		class Depth432 extends schema.object("Depth432", { x: Depth433 }) {}
		class Depth431 extends schema.object("Depth431", { x: Depth432 }) {}
		class Depth430 extends schema.object("Depth430", { x: Depth431 }) {}
		class Depth429 extends schema.object("Depth429", { x: Depth430 }) {}
		class Depth428 extends schema.object("Depth428", { x: Depth429 }) {}
		class Depth427 extends schema.object("Depth427", { x: Depth428 }) {}
		class Depth426 extends schema.object("Depth426", { x: Depth427 }) {}
		class Depth425 extends schema.object("Depth425", { x: Depth426 }) {}
		class Depth424 extends schema.object("Depth424", { x: Depth425 }) {}
		class Depth423 extends schema.object("Depth423", { x: Depth424 }) {}
		class Depth422 extends schema.object("Depth422", { x: Depth423 }) {}
		class Depth421 extends schema.object("Depth421", { x: Depth422 }) {}
		class Depth420 extends schema.object("Depth420", { x: Depth421 }) {}
		class Depth419 extends schema.object("Depth419", { x: Depth420 }) {}
		class Depth418 extends schema.object("Depth418", { x: Depth419 }) {}
		class Depth417 extends schema.object("Depth417", { x: Depth418 }) {}
		class Depth416 extends schema.object("Depth416", { x: Depth417 }) {}
		class Depth415 extends schema.object("Depth415", { x: Depth416 }) {}
		class Depth414 extends schema.object("Depth414", { x: Depth415 }) {}
		class Depth413 extends schema.object("Depth413", { x: Depth414 }) {}
		class Depth412 extends schema.object("Depth412", { x: Depth413 }) {}
		class Depth411 extends schema.object("Depth411", { x: Depth412 }) {}
		class Depth410 extends schema.object("Depth410", { x: Depth411 }) {}
		class Depth409 extends schema.object("Depth409", { x: Depth410 }) {}
		class Depth408 extends schema.object("Depth408", { x: Depth409 }) {}
		class Depth407 extends schema.object("Depth407", { x: Depth408 }) {}
		class Depth406 extends schema.object("Depth406", { x: Depth407 }) {}
		class Depth405 extends schema.object("Depth405", { x: Depth406 }) {}
		class Depth404 extends schema.object("Depth404", { x: Depth405 }) {}
		class Depth403 extends schema.object("Depth403", { x: Depth404 }) {}
		class Depth402 extends schema.object("Depth402", { x: Depth403 }) {}
		class Depth401 extends schema.object("Depth401", { x: Depth402 }) {}
		class Depth400 extends schema.object("Depth400", { x: Depth401 }) {}

		class Depth399 extends schema.object("Depth399", { x: Depth400 }) {}
		class Depth398 extends schema.object("Depth398", { x: Depth399 }) {}
		class Depth397 extends schema.object("Depth397", { x: Depth398 }) {}
		class Depth396 extends schema.object("Depth396", { x: Depth397 }) {}
		class Depth395 extends schema.object("Depth395", { x: Depth396 }) {}
		class Depth394 extends schema.object("Depth394", { x: Depth395 }) {}
		class Depth393 extends schema.object("Depth393", { x: Depth394 }) {}
		class Depth392 extends schema.object("Depth392", { x: Depth393 }) {}
		class Depth391 extends schema.object("Depth391", { x: Depth392 }) {}
		class Depth390 extends schema.object("Depth390", { x: Depth391 }) {}
		class Depth389 extends schema.object("Depth389", { x: Depth390 }) {}
		class Depth388 extends schema.object("Depth388", { x: Depth389 }) {}
		class Depth387 extends schema.object("Depth387", { x: Depth388 }) {}
		class Depth386 extends schema.object("Depth386", { x: Depth387 }) {}
		class Depth385 extends schema.object("Depth385", { x: Depth386 }) {}
		class Depth384 extends schema.object("Depth384", { x: Depth385 }) {}
		class Depth383 extends schema.object("Depth383", { x: Depth384 }) {}
		class Depth382 extends schema.object("Depth382", { x: Depth383 }) {}
		class Depth381 extends schema.object("Depth381", { x: Depth382 }) {}
		class Depth380 extends schema.object("Depth380", { x: Depth381 }) {}
		class Depth379 extends schema.object("Depth379", { x: Depth380 }) {}
		class Depth378 extends schema.object("Depth378", { x: Depth379 }) {}
		class Depth377 extends schema.object("Depth377", { x: Depth378 }) {}
		class Depth376 extends schema.object("Depth376", { x: Depth377 }) {}
		class Depth375 extends schema.object("Depth375", { x: Depth376 }) {}
		class Depth374 extends schema.object("Depth374", { x: Depth375 }) {}
		class Depth373 extends schema.object("Depth373", { x: Depth374 }) {}
		class Depth372 extends schema.object("Depth372", { x: Depth373 }) {}
		class Depth371 extends schema.object("Depth371", { x: Depth372 }) {}
		class Depth370 extends schema.object("Depth370", { x: Depth371 }) {}
		class Depth369 extends schema.object("Depth369", { x: Depth370 }) {}
		class Depth368 extends schema.object("Depth368", { x: Depth369 }) {}
		class Depth367 extends schema.object("Depth367", { x: Depth368 }) {}
		class Depth366 extends schema.object("Depth366", { x: Depth367 }) {}
		class Depth365 extends schema.object("Depth365", { x: Depth366 }) {}
		class Depth364 extends schema.object("Depth364", { x: Depth365 }) {}
		class Depth363 extends schema.object("Depth363", { x: Depth364 }) {}
		class Depth362 extends schema.object("Depth362", { x: Depth363 }) {}
		class Depth361 extends schema.object("Depth361", { x: Depth362 }) {}
		class Depth360 extends schema.object("Depth360", { x: Depth361 }) {}
		class Depth359 extends schema.object("Depth359", { x: Depth360 }) {}
		class Depth358 extends schema.object("Depth358", { x: Depth359 }) {}
		class Depth357 extends schema.object("Depth357", { x: Depth358 }) {}
		class Depth356 extends schema.object("Depth356", { x: Depth357 }) {}
		class Depth355 extends schema.object("Depth355", { x: Depth356 }) {}
		class Depth354 extends schema.object("Depth354", { x: Depth355 }) {}
		class Depth353 extends schema.object("Depth353", { x: Depth354 }) {}
		class Depth352 extends schema.object("Depth352", { x: Depth353 }) {}
		class Depth351 extends schema.object("Depth351", { x: Depth352 }) {}
		class Depth350 extends schema.object("Depth350", { x: Depth351 }) {}
		class Depth349 extends schema.object("Depth349", { x: Depth350 }) {}
		class Depth348 extends schema.object("Depth348", { x: Depth349 }) {}
		class Depth347 extends schema.object("Depth347", { x: Depth348 }) {}
		class Depth346 extends schema.object("Depth346", { x: Depth347 }) {}
		class Depth345 extends schema.object("Depth345", { x: Depth346 }) {}
		class Depth344 extends schema.object("Depth344", { x: Depth345 }) {}
		class Depth343 extends schema.object("Depth343", { x: Depth344 }) {}
		class Depth342 extends schema.object("Depth342", { x: Depth343 }) {}
		class Depth341 extends schema.object("Depth341", { x: Depth342 }) {}
		class Depth340 extends schema.object("Depth340", { x: Depth341 }) {}
		class Depth339 extends schema.object("Depth339", { x: Depth340 }) {}
		class Depth338 extends schema.object("Depth338", { x: Depth339 }) {}
		class Depth337 extends schema.object("Depth337", { x: Depth338 }) {}
		class Depth336 extends schema.object("Depth336", { x: Depth337 }) {}
		class Depth335 extends schema.object("Depth335", { x: Depth336 }) {}
		class Depth334 extends schema.object("Depth334", { x: Depth335 }) {}
		class Depth333 extends schema.object("Depth333", { x: Depth334 }) {}
		class Depth332 extends schema.object("Depth332", { x: Depth333 }) {}
		class Depth331 extends schema.object("Depth331", { x: Depth332 }) {}
		class Depth330 extends schema.object("Depth330", { x: Depth331 }) {}
		class Depth329 extends schema.object("Depth329", { x: Depth330 }) {}
		class Depth328 extends schema.object("Depth328", { x: Depth329 }) {}
		class Depth327 extends schema.object("Depth327", { x: Depth328 }) {}
		class Depth326 extends schema.object("Depth326", { x: Depth327 }) {}
		class Depth325 extends schema.object("Depth325", { x: Depth326 }) {}
		class Depth324 extends schema.object("Depth324", { x: Depth325 }) {}
		class Depth323 extends schema.object("Depth323", { x: Depth324 }) {}
		class Depth322 extends schema.object("Depth322", { x: Depth323 }) {}
		class Depth321 extends schema.object("Depth321", { x: Depth322 }) {}
		class Depth320 extends schema.object("Depth320", { x: Depth321 }) {}
		class Depth319 extends schema.object("Depth319", { x: Depth320 }) {}
		class Depth318 extends schema.object("Depth318", { x: Depth319 }) {}
		class Depth317 extends schema.object("Depth317", { x: Depth318 }) {}
		class Depth316 extends schema.object("Depth316", { x: Depth317 }) {}
		class Depth315 extends schema.object("Depth315", { x: Depth316 }) {}
		class Depth314 extends schema.object("Depth314", { x: Depth315 }) {}
		class Depth313 extends schema.object("Depth313", { x: Depth314 }) {}
		class Depth312 extends schema.object("Depth312", { x: Depth313 }) {}
		class Depth311 extends schema.object("Depth311", { x: Depth312 }) {}
		class Depth310 extends schema.object("Depth310", { x: Depth311 }) {}
		class Depth309 extends schema.object("Depth309", { x: Depth310 }) {}
		class Depth308 extends schema.object("Depth308", { x: Depth309 }) {}
		class Depth307 extends schema.object("Depth307", { x: Depth308 }) {}
		class Depth306 extends schema.object("Depth306", { x: Depth307 }) {}
		class Depth305 extends schema.object("Depth305", { x: Depth306 }) {}
		class Depth304 extends schema.object("Depth304", { x: Depth305 }) {}
		class Depth303 extends schema.object("Depth303", { x: Depth304 }) {}
		class Depth302 extends schema.object("Depth302", { x: Depth303 }) {}
		class Depth301 extends schema.object("Depth301", { x: Depth302 }) {}
		class Depth300 extends schema.object("Depth300", { x: Depth301 }) {}

		class Depth299 extends schema.object("Depth299", { x: Depth300 }) {}
		class Depth298 extends schema.object("Depth298", { x: Depth299 }) {}
		class Depth297 extends schema.object("Depth297", { x: Depth298 }) {}
		class Depth296 extends schema.object("Depth296", { x: Depth297 }) {}
		class Depth295 extends schema.object("Depth295", { x: Depth296 }) {}
		class Depth294 extends schema.object("Depth294", { x: Depth295 }) {}
		class Depth293 extends schema.object("Depth293", { x: Depth294 }) {}
		class Depth292 extends schema.object("Depth292", { x: Depth293 }) {}
		class Depth291 extends schema.object("Depth291", { x: Depth292 }) {}
		class Depth290 extends schema.object("Depth290", { x: Depth291 }) {}
		class Depth289 extends schema.object("Depth289", { x: Depth290 }) {}
		class Depth288 extends schema.object("Depth288", { x: Depth289 }) {}
		class Depth287 extends schema.object("Depth287", { x: Depth288 }) {}
		class Depth286 extends schema.object("Depth286", { x: Depth287 }) {}
		class Depth285 extends schema.object("Depth285", { x: Depth286 }) {}
		class Depth284 extends schema.object("Depth284", { x: Depth285 }) {}
		class Depth283 extends schema.object("Depth283", { x: Depth284 }) {}
		class Depth282 extends schema.object("Depth282", { x: Depth283 }) {}
		class Depth281 extends schema.object("Depth281", { x: Depth282 }) {}
		class Depth280 extends schema.object("Depth280", { x: Depth281 }) {}
		class Depth279 extends schema.object("Depth279", { x: Depth280 }) {}
		class Depth278 extends schema.object("Depth278", { x: Depth279 }) {}
		class Depth277 extends schema.object("Depth277", { x: Depth278 }) {}
		class Depth276 extends schema.object("Depth276", { x: Depth277 }) {}
		class Depth275 extends schema.object("Depth275", { x: Depth276 }) {}
		class Depth274 extends schema.object("Depth274", { x: Depth275 }) {}
		class Depth273 extends schema.object("Depth273", { x: Depth274 }) {}
		class Depth272 extends schema.object("Depth272", { x: Depth273 }) {}
		class Depth271 extends schema.object("Depth271", { x: Depth272 }) {}
		class Depth270 extends schema.object("Depth270", { x: Depth271 }) {}
		class Depth269 extends schema.object("Depth269", { x: Depth270 }) {}
		class Depth268 extends schema.object("Depth268", { x: Depth269 }) {}
		class Depth267 extends schema.object("Depth267", { x: Depth268 }) {}
		class Depth266 extends schema.object("Depth266", { x: Depth267 }) {}
		class Depth265 extends schema.object("Depth265", { x: Depth266 }) {}
		class Depth264 extends schema.object("Depth264", { x: Depth265 }) {}
		class Depth263 extends schema.object("Depth263", { x: Depth264 }) {}
		class Depth262 extends schema.object("Depth262", { x: Depth263 }) {}
		class Depth261 extends schema.object("Depth261", { x: Depth262 }) {}
		class Depth260 extends schema.object("Depth260", { x: Depth261 }) {}
		class Depth259 extends schema.object("Depth259", { x: Depth260 }) {}
		class Depth258 extends schema.object("Depth258", { x: Depth259 }) {}
		class Depth257 extends schema.object("Depth257", { x: Depth258 }) {}
		class Depth256 extends schema.object("Depth256", { x: Depth257 }) {}
		class Depth255 extends schema.object("Depth255", { x: Depth256 }) {}
		class Depth254 extends schema.object("Depth254", { x: Depth255 }) {}
		class Depth253 extends schema.object("Depth253", { x: Depth254 }) {}
		class Depth252 extends schema.object("Depth252", { x: Depth253 }) {}
		class Depth251 extends schema.object("Depth251", { x: Depth252 }) {}
		class Depth250 extends schema.object("Depth250", { x: Depth251 }) {}
		class Depth249 extends schema.object("Depth249", { x: Depth250 }) {}
		class Depth248 extends schema.object("Depth248", { x: Depth249 }) {}
		class Depth247 extends schema.object("Depth247", { x: Depth248 }) {}
		class Depth246 extends schema.object("Depth246", { x: Depth247 }) {}
		class Depth245 extends schema.object("Depth245", { x: Depth246 }) {}
		class Depth244 extends schema.object("Depth244", { x: Depth245 }) {}
		class Depth243 extends schema.object("Depth243", { x: Depth244 }) {}
		class Depth242 extends schema.object("Depth242", { x: Depth243 }) {}
		class Depth241 extends schema.object("Depth241", { x: Depth242 }) {}
		class Depth240 extends schema.object("Depth240", { x: Depth241 }) {}
		class Depth239 extends schema.object("Depth239", { x: Depth240 }) {}
		class Depth238 extends schema.object("Depth238", { x: Depth239 }) {}
		class Depth237 extends schema.object("Depth237", { x: Depth238 }) {}
		class Depth236 extends schema.object("Depth236", { x: Depth237 }) {}
		class Depth235 extends schema.object("Depth235", { x: Depth236 }) {}
		class Depth234 extends schema.object("Depth234", { x: Depth235 }) {}
		class Depth233 extends schema.object("Depth233", { x: Depth234 }) {}
		class Depth232 extends schema.object("Depth232", { x: Depth233 }) {}
		class Depth231 extends schema.object("Depth231", { x: Depth232 }) {}
		class Depth230 extends schema.object("Depth230", { x: Depth231 }) {}
		class Depth229 extends schema.object("Depth229", { x: Depth230 }) {}
		class Depth228 extends schema.object("Depth228", { x: Depth229 }) {}
		class Depth227 extends schema.object("Depth227", { x: Depth228 }) {}
		class Depth226 extends schema.object("Depth226", { x: Depth227 }) {}
		class Depth225 extends schema.object("Depth225", { x: Depth226 }) {}
		class Depth224 extends schema.object("Depth224", { x: Depth225 }) {}
		class Depth223 extends schema.object("Depth223", { x: Depth224 }) {}
		class Depth222 extends schema.object("Depth222", { x: Depth223 }) {}
		class Depth221 extends schema.object("Depth221", { x: Depth222 }) {}
		class Depth220 extends schema.object("Depth220", { x: Depth221 }) {}
		class Depth219 extends schema.object("Depth219", { x: Depth220 }) {}
		class Depth218 extends schema.object("Depth218", { x: Depth219 }) {}
		class Depth217 extends schema.object("Depth217", { x: Depth218 }) {}
		class Depth216 extends schema.object("Depth216", { x: Depth217 }) {}
		class Depth215 extends schema.object("Depth215", { x: Depth216 }) {}
		class Depth214 extends schema.object("Depth214", { x: Depth215 }) {}
		class Depth213 extends schema.object("Depth213", { x: Depth214 }) {}
		class Depth212 extends schema.object("Depth212", { x: Depth213 }) {}
		class Depth211 extends schema.object("Depth211", { x: Depth212 }) {}
		class Depth210 extends schema.object("Depth210", { x: Depth211 }) {}
		class Depth209 extends schema.object("Depth209", { x: Depth210 }) {}
		class Depth208 extends schema.object("Depth208", { x: Depth209 }) {}
		class Depth207 extends schema.object("Depth207", { x: Depth208 }) {}
		class Depth206 extends schema.object("Depth206", { x: Depth207 }) {}
		class Depth205 extends schema.object("Depth205", { x: Depth206 }) {}
		class Depth204 extends schema.object("Depth204", { x: Depth205 }) {}
		class Depth203 extends schema.object("Depth203", { x: Depth204 }) {}
		class Depth202 extends schema.object("Depth202", { x: Depth203 }) {}
		class Depth201 extends schema.object("Depth201", { x: Depth202 }) {}
		class Depth200 extends schema.object("Depth200", { x: Depth201 }) {}

		class Depth199 extends schema.object("Depth199", { x: Depth200 }) {}
		class Depth198 extends schema.object("Depth198", { x: Depth199 }) {}
		class Depth197 extends schema.object("Depth197", { x: Depth198 }) {}
		class Depth196 extends schema.object("Depth196", { x: Depth197 }) {}
		class Depth195 extends schema.object("Depth195", { x: Depth196 }) {}
		class Depth194 extends schema.object("Depth194", { x: Depth195 }) {}
		class Depth193 extends schema.object("Depth193", { x: Depth194 }) {}
		class Depth192 extends schema.object("Depth192", { x: Depth193 }) {}
		class Depth191 extends schema.object("Depth191", { x: Depth192 }) {}
		class Depth190 extends schema.object("Depth190", { x: Depth191 }) {}
		class Depth189 extends schema.object("Depth189", { x: Depth190 }) {}
		class Depth188 extends schema.object("Depth188", { x: Depth189 }) {}
		class Depth187 extends schema.object("Depth187", { x: Depth188 }) {}
		class Depth186 extends schema.object("Depth186", { x: Depth187 }) {}
		class Depth185 extends schema.object("Depth185", { x: Depth186 }) {}
		class Depth184 extends schema.object("Depth184", { x: Depth185 }) {}
		class Depth183 extends schema.object("Depth183", { x: Depth184 }) {}
		class Depth182 extends schema.object("Depth182", { x: Depth183 }) {}
		class Depth181 extends schema.object("Depth181", { x: Depth182 }) {}
		class Depth180 extends schema.object("Depth180", { x: Depth181 }) {}
		class Depth179 extends schema.object("Depth179", { x: Depth180 }) {}
		class Depth178 extends schema.object("Depth178", { x: Depth179 }) {}
		class Depth177 extends schema.object("Depth177", { x: Depth178 }) {}
		class Depth176 extends schema.object("Depth176", { x: Depth177 }) {}
		class Depth175 extends schema.object("Depth175", { x: Depth176 }) {}
		class Depth174 extends schema.object("Depth174", { x: Depth175 }) {}
		class Depth173 extends schema.object("Depth173", { x: Depth174 }) {}
		class Depth172 extends schema.object("Depth172", { x: Depth173 }) {}
		class Depth171 extends schema.object("Depth171", { x: Depth172 }) {}
		class Depth170 extends schema.object("Depth170", { x: Depth171 }) {}
		class Depth169 extends schema.object("Depth169", { x: Depth170 }) {}
		class Depth168 extends schema.object("Depth168", { x: Depth169 }) {}
		class Depth167 extends schema.object("Depth167", { x: Depth168 }) {}
		class Depth166 extends schema.object("Depth166", { x: Depth167 }) {}
		class Depth165 extends schema.object("Depth165", { x: Depth166 }) {}
		class Depth164 extends schema.object("Depth164", { x: Depth165 }) {}
		class Depth163 extends schema.object("Depth163", { x: Depth164 }) {}
		class Depth162 extends schema.object("Depth162", { x: Depth163 }) {}
		class Depth161 extends schema.object("Depth161", { x: Depth162 }) {}
		class Depth160 extends schema.object("Depth160", { x: Depth161 }) {}
		class Depth159 extends schema.object("Depth159", { x: Depth160 }) {}
		class Depth158 extends schema.object("Depth158", { x: Depth159 }) {}
		class Depth157 extends schema.object("Depth157", { x: Depth158 }) {}
		class Depth156 extends schema.object("Depth156", { x: Depth157 }) {}
		class Depth155 extends schema.object("Depth155", { x: Depth156 }) {}
		class Depth154 extends schema.object("Depth154", { x: Depth155 }) {}
		class Depth153 extends schema.object("Depth153", { x: Depth154 }) {}
		class Depth152 extends schema.object("Depth152", { x: Depth153 }) {}
		class Depth151 extends schema.object("Depth151", { x: Depth152 }) {}
		class Depth150 extends schema.object("Depth150", { x: Depth151 }) {}
		class Depth149 extends schema.object("Depth149", { x: Depth150 }) {}
		class Depth148 extends schema.object("Depth148", { x: Depth149 }) {}
		class Depth147 extends schema.object("Depth147", { x: Depth148 }) {}
		class Depth146 extends schema.object("Depth146", { x: Depth147 }) {}
		class Depth145 extends schema.object("Depth145", { x: Depth146 }) {}
		class Depth144 extends schema.object("Depth144", { x: Depth145 }) {}
		class Depth143 extends schema.object("Depth143", { x: Depth144 }) {}
		class Depth142 extends schema.object("Depth142", { x: Depth143 }) {}
		class Depth141 extends schema.object("Depth141", { x: Depth142 }) {}
		class Depth140 extends schema.object("Depth140", { x: Depth141 }) {}
		class Depth139 extends schema.object("Depth139", { x: Depth140 }) {}
		class Depth138 extends schema.object("Depth138", { x: Depth139 }) {}
		class Depth137 extends schema.object("Depth137", { x: Depth138 }) {}
		class Depth136 extends schema.object("Depth136", { x: Depth137 }) {}
		class Depth135 extends schema.object("Depth135", { x: Depth136 }) {}
		class Depth134 extends schema.object("Depth134", { x: Depth135 }) {}
		class Depth133 extends schema.object("Depth133", { x: Depth134 }) {}
		class Depth132 extends schema.object("Depth132", { x: Depth133 }) {}
		class Depth131 extends schema.object("Depth131", { x: Depth132 }) {}
		class Depth130 extends schema.object("Depth130", { x: Depth131 }) {}
		class Depth129 extends schema.object("Depth129", { x: Depth130 }) {}
		class Depth128 extends schema.object("Depth128", { x: Depth129 }) {}
		class Depth127 extends schema.object("Depth127", { x: Depth128 }) {}
		class Depth126 extends schema.object("Depth126", { x: Depth127 }) {}
		class Depth125 extends schema.object("Depth125", { x: Depth126 }) {}
		class Depth124 extends schema.object("Depth124", { x: Depth125 }) {}
		class Depth123 extends schema.object("Depth123", { x: Depth124 }) {}
		class Depth122 extends schema.object("Depth122", { x: Depth123 }) {}
		class Depth121 extends schema.object("Depth121", { x: Depth122 }) {}
		class Depth120 extends schema.object("Depth120", { x: Depth121 }) {}
		class Depth119 extends schema.object("Depth119", { x: Depth120 }) {}
		class Depth118 extends schema.object("Depth118", { x: Depth119 }) {}
		class Depth117 extends schema.object("Depth117", { x: Depth118 }) {}
		class Depth116 extends schema.object("Depth116", { x: Depth117 }) {}
		class Depth115 extends schema.object("Depth115", { x: Depth116 }) {}
		class Depth114 extends schema.object("Depth114", { x: Depth115 }) {}
		class Depth113 extends schema.object("Depth113", { x: Depth114 }) {}
		class Depth112 extends schema.object("Depth112", { x: Depth113 }) {}
		class Depth111 extends schema.object("Depth111", { x: Depth112 }) {}
		class Depth110 extends schema.object("Depth110", { x: Depth111 }) {}
		class Depth109 extends schema.object("Depth109", { x: Depth110 }) {}
		class Depth108 extends schema.object("Depth108", { x: Depth109 }) {}
		class Depth107 extends schema.object("Depth107", { x: Depth108 }) {}
		class Depth106 extends schema.object("Depth106", { x: Depth107 }) {}
		class Depth105 extends schema.object("Depth105", { x: Depth106 }) {}
		class Depth104 extends schema.object("Depth104", { x: Depth105 }) {}
		class Depth103 extends schema.object("Depth103", { x: Depth104 }) {}
		class Depth102 extends schema.object("Depth102", { x: Depth103 }) {}
		class Depth101 extends schema.object("Depth101", { x: Depth102 }) {}
		class Depth100 extends schema.object("Depth100", { x: Depth101 }) {}

		class Depth099 extends schema.object("Depth099", { x: Depth100 }) {}
		class Depth098 extends schema.object("Depth098", { x: Depth099 }) {}
		class Depth097 extends schema.object("Depth097", { x: Depth098 }) {}
		class Depth096 extends schema.object("Depth096", { x: Depth097 }) {}
		class Depth095 extends schema.object("Depth095", { x: Depth096 }) {}
		class Depth094 extends schema.object("Depth094", { x: Depth095 }) {}
		class Depth093 extends schema.object("Depth093", { x: Depth094 }) {}
		class Depth092 extends schema.object("Depth092", { x: Depth093 }) {}
		class Depth091 extends schema.object("Depth091", { x: Depth092 }) {}
		class Depth090 extends schema.object("Depth090", { x: Depth091 }) {}
		class Depth089 extends schema.object("Depth089", { x: Depth090 }) {}
		class Depth088 extends schema.object("Depth088", { x: Depth089 }) {}
		class Depth087 extends schema.object("Depth087", { x: Depth088 }) {}
		class Depth086 extends schema.object("Depth086", { x: Depth087 }) {}
		class Depth085 extends schema.object("Depth085", { x: Depth086 }) {}
		class Depth084 extends schema.object("Depth084", { x: Depth085 }) {}
		class Depth083 extends schema.object("Depth083", { x: Depth084 }) {}
		class Depth082 extends schema.object("Depth082", { x: Depth083 }) {}
		class Depth081 extends schema.object("Depth081", { x: Depth082 }) {}
		class Depth080 extends schema.object("Depth080", { x: Depth081 }) {}
		class Depth079 extends schema.object("Depth079", { x: Depth080 }) {}
		class Depth078 extends schema.object("Depth078", { x: Depth079 }) {}
		class Depth077 extends schema.object("Depth077", { x: Depth078 }) {}
		class Depth076 extends schema.object("Depth076", { x: Depth077 }) {}
		class Depth075 extends schema.object("Depth075", { x: Depth076 }) {}
		class Depth074 extends schema.object("Depth074", { x: Depth075 }) {}
		class Depth073 extends schema.object("Depth073", { x: Depth074 }) {}
		class Depth072 extends schema.object("Depth072", { x: Depth073 }) {}
		class Depth071 extends schema.object("Depth071", { x: Depth072 }) {}
		class Depth070 extends schema.object("Depth070", { x: Depth071 }) {}
		class Depth069 extends schema.object("Depth069", { x: Depth070 }) {}
		class Depth068 extends schema.object("Depth068", { x: Depth069 }) {}
		class Depth067 extends schema.object("Depth067", { x: Depth068 }) {}
		class Depth066 extends schema.object("Depth066", { x: Depth067 }) {}
		class Depth065 extends schema.object("Depth065", { x: Depth066 }) {}
		class Depth064 extends schema.object("Depth064", { x: Depth065 }) {}
		class Depth063 extends schema.object("Depth063", { x: Depth064 }) {}
		class Depth062 extends schema.object("Depth062", { x: Depth063 }) {}
		class Depth061 extends schema.object("Depth061", { x: Depth062 }) {}
		class Depth060 extends schema.object("Depth060", { x: Depth061 }) {}
		class Depth059 extends schema.object("Depth059", { x: Depth060 }) {}
		class Depth058 extends schema.object("Depth058", { x: Depth059 }) {}
		class Depth057 extends schema.object("Depth057", { x: Depth058 }) {}
		class Depth056 extends schema.object("Depth056", { x: Depth057 }) {}
		class Depth055 extends schema.object("Depth055", { x: Depth056 }) {}
		class Depth054 extends schema.object("Depth054", { x: Depth055 }) {}
		class Depth053 extends schema.object("Depth053", { x: Depth054 }) {}
		class Depth052 extends schema.object("Depth052", { x: Depth053 }) {}
		class Depth051 extends schema.object("Depth051", { x: Depth052 }) {}
		class Depth050 extends schema.object("Depth050", { x: Depth051 }) {}
		class Depth049 extends schema.object("Depth049", { x: Depth050 }) {}
		class Depth048 extends schema.object("Depth048", { x: Depth049 }) {}
		class Depth047 extends schema.object("Depth047", { x: Depth048 }) {}
		class Depth046 extends schema.object("Depth046", { x: Depth047 }) {}
		class Depth045 extends schema.object("Depth045", { x: Depth046 }) {}
		class Depth044 extends schema.object("Depth044", { x: Depth045 }) {}
		class Depth043 extends schema.object("Depth043", { x: Depth044 }) {}
		class Depth042 extends schema.object("Depth042", { x: Depth043 }) {}
		class Depth041 extends schema.object("Depth041", { x: Depth042 }) {}
		class Depth040 extends schema.object("Depth040", { x: Depth041 }) {}
		class Depth039 extends schema.object("Depth039", { x: Depth040 }) {}
		class Depth038 extends schema.object("Depth038", { x: Depth039 }) {}
		class Depth037 extends schema.object("Depth037", { x: Depth038 }) {}
		class Depth036 extends schema.object("Depth036", { x: Depth037 }) {}
		class Depth035 extends schema.object("Depth035", { x: Depth036 }) {}
		class Depth034 extends schema.object("Depth034", { x: Depth035 }) {}
		class Depth033 extends schema.object("Depth033", { x: Depth034 }) {}
		class Depth032 extends schema.object("Depth032", { x: Depth033 }) {}
		class Depth031 extends schema.object("Depth031", { x: Depth032 }) {}
		class Depth030 extends schema.object("Depth030", { x: Depth031 }) {}
		class Depth029 extends schema.object("Depth029", { x: Depth030 }) {}
		class Depth028 extends schema.object("Depth028", { x: Depth029 }) {}
		class Depth027 extends schema.object("Depth027", { x: Depth028 }) {}
		class Depth026 extends schema.object("Depth026", { x: Depth027 }) {}
		class Depth025 extends schema.object("Depth025", { x: Depth026 }) {}
		class Depth024 extends schema.object("Depth024", { x: Depth025 }) {}
		class Depth023 extends schema.object("Depth023", { x: Depth024 }) {}
		class Depth022 extends schema.object("Depth022", { x: Depth023 }) {}
		class Depth021 extends schema.object("Depth021", { x: Depth022 }) {}
		class Depth020 extends schema.object("Depth020", { x: Depth021 }) {}
		class Depth019 extends schema.object("Depth019", { x: Depth020 }) {}
		class Depth018 extends schema.object("Depth018", { x: Depth019 }) {}
		class Depth017 extends schema.object("Depth017", { x: Depth018 }) {}
		class Depth016 extends schema.object("Depth016", { x: Depth017 }) {}
		class Depth015 extends schema.object("Depth015", { x: Depth016 }) {}
		class Depth014 extends schema.object("Depth014", { x: Depth015 }) {}
		class Depth013 extends schema.object("Depth013", { x: Depth014 }) {}
		class Depth012 extends schema.object("Depth012", { x: Depth013 }) {}
		class Depth011 extends schema.object("Depth011", { x: Depth012 }) {}
		class Depth010 extends schema.object("Depth010", { x: Depth011 }) {}
		class Depth009 extends schema.object("Depth009", { x: Depth010 }) {}
		class Depth008 extends schema.object("Depth008", { x: Depth009 }) {}
		class Depth007 extends schema.object("Depth007", { x: Depth008 }) {}
		class Depth006 extends schema.object("Depth006", { x: Depth007 }) {}
		class Depth005 extends schema.object("Depth005", { x: Depth006 }) {}
		class Depth004 extends schema.object("Depth004", { x: Depth005 }) {}
		class Depth003 extends schema.object("Depth003", { x: Depth004 }) {}
		class Depth002 extends schema.object("Depth002", { x: Depth003 }) {}
		class Depth001 extends schema.object("Depth001", { x: Depth002 }) {}
		class Depth000 extends schema.object("Depth000", { x: Depth001 }) {}

		const config = new TreeViewConfiguration({
			schema: Depth000,
			enableSchemaValidation: true,
		});
	});

	it("deep object generated", () => {
		// Attempt to replace the above test with one that tasks less code.
		// Turns out using helper can cause the depth limit to get hit much earlier.

		const schema = new SchemaFactory("com.example");

		function deepObject10<const N extends string, const T extends ImplicitFieldSchema>(
			prefix: N,
			inner: T,
		) {
			class Depth009 extends schema.object(`Deep${prefix}9`, { x: inner }) {}
			class Depth008 extends schema.object(`Deep${prefix}8`, { x: Depth009 }) {}
			class Depth007 extends schema.object(`Deep${prefix}7`, { x: Depth008 }) {}
			class Depth006 extends schema.object(`Deep${prefix}6`, { x: Depth007 }) {}
			class Depth005 extends schema.object(`Deep${prefix}5`, { x: Depth006 }) {}
			class Depth004 extends schema.object(`Deep${prefix}4`, { x: Depth005 }) {}
			class Depth003 extends schema.object(`Deep${prefix}3`, { x: Depth004 }) {}
			class Depth002 extends schema.object(`Deep${prefix}2`, { x: Depth003 }) {}
			class Depth001 extends schema.object(`Deep${prefix}1`, { x: Depth002 }) {}
			class Depth000 extends schema.object(`Deep${prefix}0`, { x: Depth001 }) {}
			return Depth000;
		}

		const deep10 = deepObject10("", schema.null);
		const config10 = new TreeViewConfiguration({
			schema: deep10,
			enableSchemaValidation: true,
		});

		function deepObject20<const N extends string, const T extends ImplicitFieldSchema>(
			prefix: N,
			inner: T,
		) {
			return deepObject10(`${prefix}0`, deepObject10(`${prefix}1`, inner));
		}

		// Using deepObject20 hits limit early
		{
			const deep20 = deepObject20("", schema.null);
			// @ts-expect-error Recursion limit
			const config20 = new TreeViewConfiguration({
				schema: deep20,
				enableSchemaValidation: true,
			});
		}

		// Can go deeper with just deep10
		{
			const deep20 = deepObject10("x", deep10);
			const config20 = new TreeViewConfiguration({
				schema: deep20,
				enableSchemaValidation: true,
			});

			const deep30 = deepObject10("x", deep20);
			const config30 = new TreeViewConfiguration({
				schema: deep30,
				enableSchemaValidation: true,
			});

			const deep40 = deepObject10("x", deep30);
			const config40 = new TreeViewConfiguration({
				schema: deep40,
				enableSchemaValidation: true,
			});
		}
	});

	it("large union", () => {
		// Very deep object schema seem to work fine.
		// This is deep enough that it is likely apps won't run into issue and the true limit does not need to be checked.

		const schema = new SchemaFactory("com.example");

		class Empty100 extends schema.object("100", {}) {}
		class Empty099 extends schema.object("099", {}) {}
		class Empty098 extends schema.object("098", {}) {}
		class Empty097 extends schema.object("097", {}) {}
		class Empty096 extends schema.object("096", {}) {}
		class Empty095 extends schema.object("095", {}) {}
		class Empty094 extends schema.object("094", {}) {}
		class Empty093 extends schema.object("093", {}) {}
		class Empty092 extends schema.object("092", {}) {}
		class Empty091 extends schema.object("091", {}) {}
		class Empty090 extends schema.object("090", {}) {}
		class Empty089 extends schema.object("089", {}) {}
		class Empty088 extends schema.object("088", {}) {}
		class Empty087 extends schema.object("087", {}) {}
		class Empty086 extends schema.object("086", {}) {}
		class Empty085 extends schema.object("085", {}) {}
		class Empty084 extends schema.object("084", {}) {}
		class Empty083 extends schema.object("083", {}) {}
		class Empty082 extends schema.object("082", {}) {}
		class Empty081 extends schema.object("081", {}) {}
		class Empty080 extends schema.object("080", {}) {}
		class Empty079 extends schema.object("079", {}) {}
		class Empty078 extends schema.object("078", {}) {}
		class Empty077 extends schema.object("077", {}) {}
		class Empty076 extends schema.object("076", {}) {}
		class Empty075 extends schema.object("075", {}) {}
		class Empty074 extends schema.object("074", {}) {}
		class Empty073 extends schema.object("073", {}) {}
		class Empty072 extends schema.object("072", {}) {}
		class Empty071 extends schema.object("071", {}) {}
		class Empty070 extends schema.object("070", {}) {}
		class Empty069 extends schema.object("069", {}) {}
		class Empty068 extends schema.object("068", {}) {}
		class Empty067 extends schema.object("067", {}) {}
		class Empty066 extends schema.object("066", {}) {}
		class Empty065 extends schema.object("065", {}) {}
		class Empty064 extends schema.object("064", {}) {}
		class Empty063 extends schema.object("063", {}) {}
		class Empty062 extends schema.object("062", {}) {}
		class Empty061 extends schema.object("061", {}) {}
		class Empty060 extends schema.object("060", {}) {}
		class Empty059 extends schema.object("059", {}) {}
		class Empty058 extends schema.object("058", {}) {}
		class Empty057 extends schema.object("057", {}) {}
		class Empty056 extends schema.object("056", {}) {}
		class Empty055 extends schema.object("055", {}) {}
		class Empty054 extends schema.object("054", {}) {}
		class Empty053 extends schema.object("053", {}) {}
		class Empty052 extends schema.object("052", {}) {}
		class Empty051 extends schema.object("051", {}) {}
		class Empty050 extends schema.object("050", {}) {}
		class Empty049 extends schema.object("049", {}) {}
		class Empty048 extends schema.object("048", {}) {}
		class Empty047 extends schema.object("047", {}) {}
		class Empty046 extends schema.object("046", {}) {}
		class Empty045 extends schema.object("045", {}) {}
		class Empty044 extends schema.object("044", {}) {}
		class Empty043 extends schema.object("043", {}) {}
		class Empty042 extends schema.object("042", {}) {}
		class Empty041 extends schema.object("041", {}) {}
		class Empty040 extends schema.object("040", {}) {}
		class Empty039 extends schema.object("039", {}) {}
		class Empty038 extends schema.object("038", {}) {}
		class Empty037 extends schema.object("037", {}) {}
		class Empty036 extends schema.object("036", {}) {}
		class Empty035 extends schema.object("035", {}) {}
		class Empty034 extends schema.object("034", {}) {}
		class Empty033 extends schema.object("033", {}) {}
		class Empty032 extends schema.object("032", {}) {}
		class Empty031 extends schema.object("031", {}) {}
		class Empty030 extends schema.object("030", {}) {}
		class Empty029 extends schema.object("029", {}) {}
		class Empty028 extends schema.object("028", {}) {}
		class Empty027 extends schema.object("027", {}) {}
		class Empty026 extends schema.object("026", {}) {}
		class Empty025 extends schema.object("025", {}) {}
		class Empty024 extends schema.object("024", {}) {}
		class Empty023 extends schema.object("023", {}) {}
		class Empty022 extends schema.object("022", {}) {}
		class Empty021 extends schema.object("021", {}) {}
		class Empty020 extends schema.object("020", {}) {}
		class Empty019 extends schema.object("019", {}) {}
		class Empty018 extends schema.object("018", {}) {}
		class Empty017 extends schema.object("017", {}) {}
		class Empty016 extends schema.object("016", {}) {}
		class Empty015 extends schema.object("015", {}) {}
		class Empty014 extends schema.object("014", {}) {}
		class Empty013 extends schema.object("013", {}) {}
		class Empty012 extends schema.object("012", {}) {}
		class Empty011 extends schema.object("011", {}) {}
		class Empty010 extends schema.object("010", {}) {}
		class Empty009 extends schema.object("009", {}) {}
		class Empty008 extends schema.object("008", {}) {}
		class Empty007 extends schema.object("007", {}) {}
		class Empty006 extends schema.object("006", {}) {}
		class Empty005 extends schema.object("005", {}) {}
		class Empty004 extends schema.object("004", {}) {}
		class Empty003 extends schema.object("003", {}) {}
		class Empty002 extends schema.object("002", {}) {}
		class Empty001 extends schema.object("001", {}) {}
		class Empty000 extends schema.object("000", {}) {}

		const union40 = [
			Empty039,
			Empty038,
			Empty037,
			Empty036,
			Empty035,
			Empty034,
			Empty033,
			Empty032,
			Empty031,
			Empty030,
			Empty029,
			Empty028,
			Empty027,
			Empty026,
			Empty025,
			Empty024,
			Empty023,
			Empty022,
			Empty021,
			Empty020,
			Empty019,
			Empty018,
			Empty017,
			Empty016,
			Empty015,
			Empty014,
			Empty013,
			Empty012,
			Empty011,
			Empty010,
			Empty009,
			Empty008,
			Empty007,
			Empty006,
			Empty005,
			Empty004,
			Empty003,
			Empty002,
			Empty001,
			Empty000,
		] as const;

		const union100 = [
			Empty100,
			Empty099,
			Empty098,
			Empty097,
			Empty096,
			Empty095,
			Empty094,
			Empty093,
			Empty092,
			Empty091,
			Empty090,
			Empty089,
			Empty088,
			Empty087,
			Empty086,
			Empty085,
			Empty084,
			Empty083,
			Empty082,
			Empty081,
			Empty080,
			Empty079,
			Empty078,
			Empty077,
			Empty076,
			Empty075,
			Empty074,
			Empty073,
			Empty072,
			Empty071,
			Empty070,
			Empty069,
			Empty068,
			Empty067,
			Empty066,
			Empty065,
			Empty064,
			Empty063,
			Empty062,
			Empty061,
			Empty060,
			Empty059,
			Empty058,
			Empty057,
			Empty056,
			Empty055,
			Empty054,
			Empty053,
			Empty052,
			Empty051,
			Empty050,
			Empty049,
			Empty048,
			Empty047,
			Empty046,
			Empty045,
			Empty044,
			Empty043,
			Empty042,
			Empty041,
			Empty040,
			Empty039,
			Empty038,
			Empty037,
			Empty036,
			Empty035,
			Empty034,
			Empty033,
			Empty032,
			Empty031,
			Empty030,
			Empty029,
			Empty028,
			Empty027,
			Empty026,
			Empty025,
			Empty024,
			Empty023,
			Empty022,
			Empty021,
			Empty020,
			Empty019,
			Empty018,
			Empty017,
			Empty016,
			Empty015,
			Empty014,
			Empty013,
			Empty012,
			Empty011,
			Empty010,
			Empty009,
			Empty008,
			Empty007,
			Empty006,
			Empty005,
			Empty004,
			Empty003,
			Empty002,
			Empty001,
			Empty000,
		] as const;

		{
			const config = new TreeViewConfiguration({
				schema: union100,
				enableSchemaValidation: true,
			});

			const field1 = schema.required(union100);
			const field2 = schema.optional(union100);

			// Workaround for recursion limit in union inside a schema.
			// Uses a dummy object with the same schema but using the recursive APIs then uses the repeated ValidateRecursiveSchema workaround.
			{
				class ObjectNodeDummy extends schema.objectRecursive("ObjectNode", {
					data: union100,
				}) {}
				// @ts-expect-error Recursion limit
				type _check1 = FixRecursiveRecursionLimit<typeof ObjectNodeDummy>;
				type _check2 = FixRecursiveRecursionLimit<typeof ObjectNodeDummy>;
				type _check3 = ValidateRecursiveSchema<typeof ObjectNodeDummy>;
			}

			// This fails to compile if the above dummy object isn't in included.
			class ObjectNode extends schema.object("ObjectNode", {
				data: union100,
			}) {}
		}

		// This case works fine.
		{
			class ArrayNode extends schema.array("ArrayNode", [
				// Empty043,
				Empty042,
				Empty041,
				Empty040,
				...union40,
			]) {}
			const config = new TreeViewConfiguration({
				schema: ArrayNode,
				enableSchemaValidation: true,
			});

			const field = schema.required(ArrayNode);
		}

		// This fails to compile if the above tests are commented out making it hard to pin down the exact size limit in tests like this.
		{
			class ArrayNode extends schema.array("ArrayNode", [
				Empty043,
				Empty042,
				Empty041,
				Empty040,
				...union40,
			]) {}
			const config = new TreeViewConfiguration({
				schema: ArrayNode,
				enableSchemaValidation: true,
			});
			const field = schema.required(ArrayNode);
		}

		// This fails to compile if the above tests are commented out making it hard to pin down the exact size limit in tests like this.
		{
			class MapNode extends schema.map("MapNode", [
				Empty042,
				Empty041,
				Empty040,
				...union40,
			]) {}
			const config = new TreeViewConfiguration({
				schema: MapNode,
				enableSchemaValidation: true,
			});
			const field = schema.optional([() => MapNode]);

			const AreEqualBase = schema.objectRecursive("AreEqual", {
				id: schema.identifier,
				operands: MapNode,
			});
		}
	});

	it("large recursive union", () => {
		const schema = new SchemaFactory("com.example");

		const union = [
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

		class Empty100 extends schema.objectRecursive("100", { x: union }) {}
		class Empty099 extends schema.objectRecursive("099", { x: union }) {}
		class Empty098 extends schema.objectRecursive("098", { x: union }) {}
		class Empty097 extends schema.objectRecursive("097", { x: union }) {}
		class Empty096 extends schema.objectRecursive("096", { x: union }) {}
		class Empty095 extends schema.objectRecursive("095", { x: union }) {}
		class Empty094 extends schema.objectRecursive("094", { x: union }) {}
		class Empty093 extends schema.objectRecursive("093", { x: union }) {}
		class Empty092 extends schema.objectRecursive("092", { x: union }) {}
		class Empty091 extends schema.objectRecursive("091", { x: union }) {}
		class Empty090 extends schema.objectRecursive("090", { x: union }) {}
		class Empty089 extends schema.objectRecursive("089", { x: union }) {}
		class Empty088 extends schema.objectRecursive("088", { x: union }) {}
		class Empty087 extends schema.objectRecursive("087", { x: union }) {}
		class Empty086 extends schema.objectRecursive("086", { x: union }) {}
		class Empty085 extends schema.objectRecursive("085", { x: union }) {}
		class Empty084 extends schema.objectRecursive("084", { x: union }) {}
		class Empty083 extends schema.objectRecursive("083", { x: union }) {}
		class Empty082 extends schema.objectRecursive("082", { x: union }) {}
		class Empty081 extends schema.objectRecursive("081", { x: union }) {}
		class Empty080 extends schema.objectRecursive("080", { x: union }) {}
		class Empty079 extends schema.objectRecursive("079", { x: union }) {}
		class Empty078 extends schema.objectRecursive("078", { x: union }) {}
		class Empty077 extends schema.objectRecursive("077", { x: union }) {}
		class Empty076 extends schema.objectRecursive("076", { x: union }) {}
		class Empty075 extends schema.objectRecursive("075", { x: union }) {}
		class Empty074 extends schema.objectRecursive("074", { x: union }) {}
		class Empty073 extends schema.objectRecursive("073", { x: union }) {}
		class Empty072 extends schema.objectRecursive("072", { x: union }) {}
		class Empty071 extends schema.objectRecursive("071", { x: union }) {}
		class Empty070 extends schema.objectRecursive("070", { x: union }) {}
		class Empty069 extends schema.objectRecursive("069", { x: union }) {}
		class Empty068 extends schema.objectRecursive("068", { x: union }) {}
		class Empty067 extends schema.objectRecursive("067", { x: union }) {}
		class Empty066 extends schema.objectRecursive("066", { x: union }) {}
		class Empty065 extends schema.objectRecursive("065", { x: union }) {}
		class Empty064 extends schema.objectRecursive("064", { x: union }) {}
		class Empty063 extends schema.objectRecursive("063", { x: union }) {}
		class Empty062 extends schema.objectRecursive("062", { x: union }) {}
		class Empty061 extends schema.objectRecursive("061", { x: union }) {}
		class Empty060 extends schema.objectRecursive("060", { x: union }) {}
		class Empty059 extends schema.objectRecursive("059", { x: union }) {}
		class Empty058 extends schema.objectRecursive("058", { x: union }) {}
		class Empty057 extends schema.objectRecursive("057", { x: union }) {}
		class Empty056 extends schema.objectRecursive("056", { x: union }) {}
		class Empty055 extends schema.objectRecursive("055", { x: union }) {}
		class Empty054 extends schema.objectRecursive("054", { x: union }) {}
		class Empty053 extends schema.objectRecursive("053", { x: union }) {}
		class Empty052 extends schema.objectRecursive("052", { x: union }) {}
		class Empty051 extends schema.objectRecursive("051", { x: union }) {}
		class Empty050 extends schema.objectRecursive("050", { x: union }) {}
		class Empty049 extends schema.objectRecursive("049", { x: union }) {}
		class Empty048 extends schema.objectRecursive("048", { x: union }) {}
		class Empty047 extends schema.objectRecursive("047", { x: union }) {}
		class Empty046 extends schema.objectRecursive("046", { x: union }) {}
		class Empty045 extends schema.objectRecursive("045", { x: union }) {}
		class Empty044 extends schema.objectRecursive("044", { x: union }) {}
		class Empty043 extends schema.objectRecursive("043", { x: union }) {}
		class Empty042 extends schema.objectRecursive("042", { x: union }) {}
		class Empty041 extends schema.objectRecursive("041", { x: union }) {}
		class Empty040 extends schema.objectRecursive("040", { x: union }) {}
		class Empty039 extends schema.objectRecursive("039", { x: union }) {}
		class Empty038 extends schema.objectRecursive("038", { x: union }) {}
		class Empty037 extends schema.objectRecursive("037", { x: union }) {}
		class Empty036 extends schema.objectRecursive("036", { x: union }) {}
		class Empty035 extends schema.objectRecursive("035", { x: union }) {}
		class Empty034 extends schema.objectRecursive("034", { x: union }) {}
		class Empty033 extends schema.objectRecursive("033", { x: union }) {}
		class Empty032 extends schema.objectRecursive("032", { x: union }) {}
		class Empty031 extends schema.objectRecursive("031", { x: union }) {}
		class Empty030 extends schema.objectRecursive("030", { x: union }) {}
		class Empty029 extends schema.objectRecursive("029", { x: union }) {}
		class Empty028 extends schema.objectRecursive("028", { x: union }) {}
		class Empty027 extends schema.objectRecursive("027", { x: union }) {}
		class Empty026 extends schema.objectRecursive("026", { x: union }) {}
		class Empty025 extends schema.objectRecursive("025", { x: union }) {}
		class Empty024 extends schema.objectRecursive("024", { x: union }) {}
		class Empty023 extends schema.objectRecursive("023", { x: union }) {}
		class Empty022 extends schema.objectRecursive("022", { x: union }) {}
		class Empty021 extends schema.objectRecursive("021", { x: union }) {}
		class Empty020 extends schema.objectRecursive("020", { x: union }) {}
		class Empty019 extends schema.objectRecursive("019", { x: union }) {}
		class Empty018 extends schema.objectRecursive("018", { x: union }) {}
		class Empty017 extends schema.objectRecursive("017", { x: union }) {}
		class Empty016 extends schema.objectRecursive("016", { x: union }) {}
		class Empty015 extends schema.objectRecursive("015", { x: union }) {}
		class Empty014 extends schema.objectRecursive("014", { x: union }) {}
		class Empty013 extends schema.objectRecursive("013", { x: union }) {}
		class Empty012 extends schema.objectRecursive("012", { x: union }) {}
		class Empty011 extends schema.objectRecursive("011", { x: union }) {}
		class Empty010 extends schema.objectRecursive("010", { x: union }) {}
		class Empty009 extends schema.objectRecursive("009", { x: union }) {}
		class Empty008 extends schema.objectRecursive("008", { x: union }) {}
		class Empty007 extends schema.objectRecursive("007", { x: union }) {}
		class Empty006 extends schema.objectRecursive("006", { x: union }) {}
		class Empty005 extends schema.objectRecursive("005", { x: union }) {}
		class Empty004 extends schema.objectRecursive("004", { x: union }) {}
		class Empty003 extends schema.objectRecursive("003", { x: union }) {}
		class Empty002 extends schema.objectRecursive("002", { x: union }) {}
		class Empty001 extends schema.objectRecursive("001", { x: union }) {}
		class Empty000 extends schema.objectRecursive("000", { x: union }) {}

		{
			// @ts-expect-error Recursion limit
			type _check1 = FixRecursiveRecursionLimit<typeof Empty000>;
			type _check2 = FixRecursiveRecursionLimit<typeof Empty000>;
			type _check3 = ValidateRecursiveSchema<typeof Empty000>;
		}

		{
			// This fails if the ValidateRecursiveSchema above is removed.
			class ObjectNode extends schema.object("ObjectNode", { x: union }) {}
			const config = new TreeViewConfiguration({
				schema: union,
				enableSchemaValidation: true,
			});
		}
	});
});
