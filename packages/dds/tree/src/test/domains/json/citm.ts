/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file replicates data which contains nulls, and thus the nulls introduced here are not new.
/* eslint-disable @rushstack/no-new-null */

import { type IRandom, makeRandom } from "@fluid-private/stochastic-test-utils";

import type { FieldKey } from "../../../core/index.js";
import { brand } from "../../../util/index.js";

import { getRandomEnglishString, getSizeInBytes } from "./jsonGeneratorUtils.js";

/**
 * This file contains logic to generate a JSON file that is statistically similar to the well-known
 * json benchmarks citm_catalog.json - https://github.com/serde-rs/json-benchmark/blob/master/data/citm_catalog.json
 */

export interface CitmCatalog {
	// A map of constants where the keys are referenced within the CitmCatalog.Perfomance object
	// (See CitmCatalog.Performance.seatCategories.areas.areaId)
	areaNames: Record<string, string>;
	// A map of constants where the keys (id's) are referenced in the CitmCatalog.Perfomance object
	// (See CitmCatalog.Performance.prices.audienceSubCategoryId).
	// Note, the original JSON has only 1 key value pair.
	audienceSubCategoryNames: Record<string, string>;
	blockNames: Record<string, never>; // Always shows up as a empty object
	events: Record<string, Event>;
	performances: Performance[];
	// A map of constants where the keys (id's) are referenced in the CitmCatalog.Perfomance object
	// (See CitmCatalog.Performance.prices.seatCategoryId and CitmCatalog.Performance.seatCategories.seatCategoryId)
	seatCategoryNames: Record<string, string>;
	// A map of constants where the keys (id's) are referenced in the CitmCatalog.Perfomance object
	// (See CitmCatalog.Performance.prices.seatCategoryId and CitmCatalog.Performance.seatCategories.seatCategoryId)
	subTopicNames: Record<string, string>;
	subjectNames: Record<string, never>; // always shows up as a empty object
	topicNames: Record<string, string>;
	topicSubTopics: Record<string, number[]>;
	venueNames: {
		PLEYEL_PLEYEL: "Salle Pleyel"; // There are no other values for this
	};
}

export const CitmCatalog = {
	// Shared tree keys that map to the type used by the CitmCatalog type/dataset
	SharedTreeFieldKey: {
		performances: brand<FieldKey>("performances"),
		seatCategories: brand<FieldKey>("seatCategories"),
		start: brand<FieldKey>("start"),
	},
};

interface Performance {
	eventId: number; // always references an existing event id within the set of events in a CitmJson object
	id: number; // unique number id across keypsace used within the entire CitmJson object.
	logo: string | null; // always matches the value with the associated event object logo property value.
	name: null; // Always null in original
	prices: {
		amount: number; // integer dollar amount 10000 to 180500
		audienceSubCategoryId: number;
		seatCategoryId: number;
	}[];
	seatCategories: {
		areas: {
			areaId: number; // Is always a number within the area Names property of the main CitmCatalog interface
			blockIds: never[]; // **figure out if there are any non empty blockIds
		}[];
		seatCategoryId: number;
	}[];
	seatMapImage: null; // Always null in original
	start: number; // epoch time number
	venueCode: "PLEYEL_PLEYEL";
}

interface Event {
	description: null; // Always null in original
	id: number; // unique number id across keypsace used within the entire CitmJson object.
	logo: string | null; // Formatted as '/images/UE0AAAAACEK<2-random-characters-or-numbers>QAAAAVDSVRN'
	name: string; // This value can repeat across events, but the event Id cannot.
	subTopicIds: number[];
	subjectCode: null; // Always null in original
	subtitle: null; // Always null in original
	topicIds: number[]; // Get stats on the amount of numbers here
}

function increaseKeyspace(
	keySpace: string[],
	multiplier: number,
	keyLen: number,
	random: IRandom,
) {
	const newKeyspace = [...keySpace];
	if (multiplier <= 0) {
		throw new Error("multiplier must be greater than 0");
	}
	const adjustedLength = Math.max(1, Math.floor(keySpace.length * multiplier));
	const difference = adjustedLength - keySpace.length;
	for (let i = 0; i < difference; i++) {
		newKeyspace.push(getRandomEnglishString(random, true, keyLen, keyLen));
	}
	return newKeyspace;
}

function decreaseKeyspace(keySpace: string[], multiplier: number) {
	const newKeyspace = [...keySpace];
	if (multiplier >= 1 || multiplier <= 0) {
		throw new Error("multiplier must be less than 1 and greater than 0");
	}
	const adjustedLength = Math.floor(keySpace.length * multiplier);
	if (adjustedLength === 0) {
		return [];
	}
	return newKeyspace.slice(0, adjustedLength - 1);
}

// Original Distribution: 98 Unique Keys across 4 keyspaces:
// areaNames: 16(16.326%), seatCategoryNames: 60(61.224%), subTopicNames: 18(18.367%), topicNames: 4(4.081%)
// Note that maxSizeInKb does not account for the initial keyspace size so you can end up with json that
// is larger than the defined size if you define a large enough keyspace
export function generateCitmJson(
	keyspaceMultiplier: number = 1,
	maxSizeInBytes: number,
	seed = 1,
) {
	const random = makeRandom(seed);
	const baseIdNumber = random.integer(100000000, 300000000);
	let idNumberCounter = baseIdNumber;

	// 1. Create areaNames property
	const areaNames: Record<string, string> = {};
	// These base values are from the original json
	let areaNameValues = ORIGINAL_AREA_NAME_VALUES;
	if (keyspaceMultiplier > 1) {
		// 20 is the average key length of the original json seat category names
		areaNameValues = increaseKeyspace(
			ORIGINAL_AREA_NAME_VALUES,
			keyspaceMultiplier,
			20,
			random,
		);
	} else if (keyspaceMultiplier < 1) {
		areaNameValues = decreaseKeyspace(ORIGINAL_AREA_NAME_VALUES, keyspaceMultiplier);
	}
	// construct keys for each vaue and insert into object.
	for (const value of areaNameValues) {
		idNumberCounter += 1;
		areaNames[`${idNumberCounter}`] = value;
	}

	// 2. create audienceSubCategoryNames property
	// (In the original JSON this only had one key value pair.)
	idNumberCounter += 1;
	const audienceSubCategoryNames = { [`${idNumberCounter}`]: "Abonné" };

	// 3. Create seatCategoryNames property
	const seatCategoryNames: Record<string, string> = {};
	let seatCategoryNameValues = ORIGINAL_SEAT_CATEGORY_NAME_VALUES;
	if (keyspaceMultiplier > 1) {
		// 13 is the average key length of the original json seat category names
		seatCategoryNameValues = increaseKeyspace(
			ORIGINAL_SEAT_CATEGORY_NAME_VALUES,
			keyspaceMultiplier,
			13,
			random,
		);
	} else if (keyspaceMultiplier < 1) {
		seatCategoryNameValues = decreaseKeyspace(
			ORIGINAL_SEAT_CATEGORY_NAME_VALUES,
			keyspaceMultiplier,
		);
	}

	for (const value of seatCategoryNameValues) {
		idNumberCounter += 1;
		seatCategoryNames[`${idNumberCounter}`] = value;
	}

	// 4. create subTopicNames property
	const subTopicNames: Record<string, string> = {};
	let subTopicNameValues = ORIGINAL_SUB_TOPIC_NAME_VALUES;
	if (keyspaceMultiplier > 1) {
		// 13 is the average key length of the original json sub topic names
		subTopicNameValues = increaseKeyspace(
			ORIGINAL_SUB_TOPIC_NAME_VALUES,
			keyspaceMultiplier,
			13,
			random,
		);
	} else if (keyspaceMultiplier < 1) {
		subTopicNameValues = decreaseKeyspace(ORIGINAL_SUB_TOPIC_NAME_VALUES, keyspaceMultiplier);
	}

	for (const value of subTopicNameValues) {
		idNumberCounter += 1;
		subTopicNames[`${idNumberCounter}`] = value;
	}

	// 5. create topicNames property
	const topicNames: Record<string, string> = {};
	let topicNameValues = ORIGINAL_TOPIC_NAME_VALUES;
	if (keyspaceMultiplier > 1) {
		// 12 is the average key length of the original json sub topic names
		topicNameValues = increaseKeyspace(
			ORIGINAL_TOPIC_NAME_VALUES,
			keyspaceMultiplier,
			12,
			random,
		);
	} else if (keyspaceMultiplier < 1) {
		topicNameValues = decreaseKeyspace(ORIGINAL_TOPIC_NAME_VALUES, keyspaceMultiplier);
	}

	for (const value of topicNameValues) {
		idNumberCounter += 1;
		topicNames[`${idNumberCounter}`] = value;
	}

	// 6. Create topicSubTopics property
	// Randomly assigns atleast 1 subtopic to each topic.
	const topicSubTopics: Record<string, number[]> = {};
	const subTopicIds = Object.keys(subTopicNames);
	const topicIds = Object.keys(topicNames);
	while (subTopicIds.length > 0) {
		const currTopicId = topicIds.pop();
		// This ensures that each topic gets at least 1 subTopic.
		const availableSubTopicIds = subTopicIds.length - topicIds.length;
		let numSubTopicsToAdd = random.integer(1, availableSubTopicIds);
		// There may be unused subTopic id's by them time we get to the last topicId so this ensures they all get used.
		if (topicIds.length === 0) {
			numSubTopicsToAdd = subTopicIds.length;
		}
		topicSubTopics[`${currTopicId}`] = [];
		for (let i = 0; i < numSubTopicsToAdd; i++) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			topicSubTopics[`${currTopicId}`].push(Number.parseInt(subTopicIds.pop()!, 10));
		}
	}

	// 7. Create blockNames property
	// (In the original JSON this always shows up as a empty object.)
	const blockNames: Record<string, never> = {};

	// 8. Create subjectNames property
	// (In the original JSON this always shows up as a empty object.)
	const subjectNames: Record<string, never> = {};

	// 9. Create venueNames property
	// (In the original JSON this always shows up as a static object.)
	const venueNames = { PLEYEL_PLEYEL: "Salle Pleyel" };

	// 10. Create each event object
	const events: Record<string, Event> = {};
	idNumberCounter += 1; // incremented once to avoid using the last key value.

	// 11. Create performance objects
	const performances: Performance[] = [];

	// 12. Create (atleast 1) event and performance(s)
	const eventAndPerformance = generateEventAndPerformance(
		random,
		idNumberCounter,
		Object.keys(topicNames),
		topicSubTopics,
		seatCategoryNames,
		audienceSubCategoryNames,
		areaNames,
	);
	performances.push(eventAndPerformance.performance);
	events[`${eventAndPerformance.event.id}`] = eventAndPerformance.event;
	let objectCurrentSizeBytes = getSizeInBytes({
		areaNames,
		audienceSubCategoryNames,
		blockNames,
		events,
		performances,
		seatCategoryNames,
		subTopicNames,
		subjectNames,
		topicNames,
		topicSubTopics,
		venueNames,
	});

	while (objectCurrentSizeBytes < maxSizeInBytes) {
		const nextEventAndPerformance = generateEventAndPerformance(
			random,
			idNumberCounter,
			Object.keys(topicNames),
			topicSubTopics,
			seatCategoryNames,
			audienceSubCategoryNames,
			areaNames,
		);
		performances.push(nextEventAndPerformance.performance);
		events[`${nextEventAndPerformance.event.id}`] = nextEventAndPerformance.event;
		idNumberCounter = nextEventAndPerformance.idNumberCounter;

		objectCurrentSizeBytes += getSizeInBytes(nextEventAndPerformance.performance);
		// This will be very slighlty more than the actual size addition because of two brackets for the object.
		objectCurrentSizeBytes += getSizeInBytes({
			[nextEventAndPerformance.event.id]: nextEventAndPerformance.event,
		});
	}
	idNumberCounter = eventAndPerformance.idNumberCounter;

	return {
		areaNames,
		audienceSubCategoryNames,
		blockNames,
		events,
		performances,
		seatCategoryNames,
		subTopicNames,
		subjectNames,
		topicNames,
		topicSubTopics,
		venueNames,
	};
}

function generateEventAndPerformance(
	random: IRandom,
	idNumberCounter: number,
	topicIds: string[],
	topicSubTopics: Record<string, number[]>,
	seatCategoryNames: Record<string, string>,
	audienceSubCategoryNames: Record<string, string>,
	areaNames: Record<string, string>,
) {
	// Semi-Randomly select topic Id's
	const eventTopicIdSet = new Set<number>();
	const numTopicsToInclude = random.integer(0, Math.min(4, topicIds.length));
	for (let j = 0; j < numTopicsToInclude; j++) {
		let topicIdIndex = random.integer(0, topicIds.length - 1);
		let topicIdToAdd = Number.parseInt(topicIds[topicIdIndex], 10);
		// If random selection picks a previously used topicId
		// then we increment forwards once until an unencountered id appears
		while (eventTopicIdSet.has(topicIdToAdd)) {
			topicIdIndex += 1;
			if (topicIdIndex > topicIds.length - 1) {
				topicIdIndex = topicIdIndex % topicIds.length;
			}
			topicIdToAdd = Number.parseInt(topicIds[topicIdIndex], 10);
		}
		eventTopicIdSet.add(topicIdToAdd);
	}

	// Semi-Randomly select subTopic Id's under each event topic
	const eventSubTopicIdSet = new Set<number>();
	if (numTopicsToInclude > 0) {
		let processedTopicIdCount = 0;
		eventTopicIdSet.forEach((topicId) => {
			const topicSubTopicIds = topicSubTopics[`${topicId}`];
			// This reserves atleast 1 subtopicId to be added for each topic id.
			const unprocessedTopicIds = eventTopicIdSet.size - processedTopicIdCount;
			const numSubTopicsToInclude = random.integer(
				1,
				Math.min(topicSubTopicIds.length, unprocessedTopicIds),
			);
			for (let x = 0; x < numSubTopicsToInclude; x++) {
				let subTopicIndex = random.integer(0, topicSubTopicIds.length - 1);
				let subTopicIdToAdd = topicSubTopicIds[subTopicIndex];
				// If random selection picks a previously used topicId
				// then we increment forwards once until an unencountered id appears
				while (eventSubTopicIdSet.has(subTopicIdToAdd)) {
					subTopicIndex += 1;
					if (subTopicIndex > topicSubTopicIds.length - 1) {
						subTopicIndex = subTopicIndex % topicSubTopicIds.length;
					}
					subTopicIdToAdd = topicSubTopicIds[subTopicIndex];
				}
				eventSubTopicIdSet.add(subTopicIdToAdd);
			}
			processedTopicIdCount++;
		});
	}

	// All logo strings in the original follow this pattern. and have a 48.913% chance of being null
	const logo = random.bool(0.48913)
		? `/images/UE0AAAAACEK${getRandomEnglishString(random, true, 2, 2)}QAAAAVDSVRN`
		: null;

	const event: Event = {
		description: null,
		id: idNumberCounter,
		logo,
		name: ORIGINAL_EVENT_NAMES[random.integer(0, ORIGINAL_EVENT_NAMES.length - 1)],
		subjectCode: null,
		subtitle: null,
		topicIds: Array.from(eventTopicIdSet),
		subTopicIds: Array.from(eventSubTopicIdSet),
	};

	// eslint-disable-next-line no-param-reassign
	idNumberCounter += 1;

	// 11a. create prices object
	const prices = [];
	const numPricesToAdd = random.integer(1, 5);
	const usedSeatCategoryIds = new Set<string>();
	const availableSeatCategoryIds = Object.keys(seatCategoryNames);
	for (let i = 0; i < numPricesToAdd; i++) {
		let seatCategoryIdIndex = random.integer(0, availableSeatCategoryIds.length - 1);
		let seatCategoryId = availableSeatCategoryIds[seatCategoryIdIndex];
		while (usedSeatCategoryIds.has(seatCategoryId)) {
			seatCategoryIdIndex += 1;
			if (seatCategoryIdIndex > availableSeatCategoryIds.length - 1) {
				seatCategoryIdIndex = seatCategoryIdIndex % availableSeatCategoryIds.length;
			}
			seatCategoryId = availableSeatCategoryIds[seatCategoryIdIndex];
		}
		prices.push({
			amount: random.integer(10000, 180500),
			audienceSubCategoryId: Number.parseInt(Object.keys(audienceSubCategoryNames)[0], 10),
			seatCategoryId: Number.parseInt(seatCategoryId, 10),
		});
	}
	// 11b. create seatCategories object
	const seatCategories: {
		areas: { areaId: number; blockIds: never[] }[];
		seatCategoryId: number;
	}[] = [];
	const availableAreaIds = Object.keys(areaNames);
	prices.forEach((priceObject) => {
		const numAreaIdsToAdd = random.integer(1, Math.min(availableAreaIds.length, 16));
		const areas = [];
		for (let i = 0; i < numAreaIdsToAdd; i++) {
			areas.push({
				areaId: Number.parseInt(availableAreaIds[i], 10),
				blockIds: [],
			});
		}
		seatCategories.push({
			areas,
			seatCategoryId: priceObject.seatCategoryId,
		});
	});
	const performance: Performance = {
		eventId: event.id,
		id: idNumberCounter,
		logo: event.logo,
		name: null,
		prices,
		seatCategories,
		seatMapImage: null,
		start: 1378922400000,
		venueCode: "PLEYEL_PLEYEL",
	};
	// eslint-disable-next-line no-param-reassign
	idNumberCounter += 1;

	return {
		event,
		performance,
		idNumberCounter,
	};
}

const ORIGINAL_AREA_NAME_VALUES = [
	"Arrière-scène central",
	"1er balcon central",
	"2ème balcon bergerie cour",
	"2ème balcon bergerie jardin",
	"1er balcon bergerie jardin",
	"1er balcon bergerie cour",
	"Arrière-scène jardin",
	"Arrière-scène cour",
	"2ème balcon jardin",
	"2ème balcon cour",
	"2ème Balcon central",
	"1er balcon jardin",
	"1er balcon cour",
	"Orchestre central",
	"Orchestre jardin",
	"Orchestre cour",
	"Zone physique secrète",
];

const ORIGINAL_SEAT_CATEGORY_NAME_VALUES = [
	"1ère catégorie",
	"2ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"5ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"5ème catégorie",
	"5ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"5ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"5ème catégorie",
	"Catégorie unique",
	"1ère catégorie",
	"2ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"5ème catégorie",
	"Catégorie 3",
	"Catégorie 1",
	"Catégorie 2",
	"Catégorie 4",
	"Catégorie 5",
	"CAT1",
	"CAT2",
	"CAT3",
	"CAT4",
	"CAT5",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"1ère catégorie",
	"2ème catégorie",
	"3ème catégorie",
	"4ème catégorie",
	"1ère catégorie",
	"catétgorie unique",
];

const ORIGINAL_SUB_TOPIC_NAME_VALUES = [
	"Musique amplifiée",
	"Musique baroque",
	"Ciné-concert",
	"Musique classique",
	"Jazz",
	"Musique de chambre",
	"Musique dirigée",
	"Musique du monde",
	"Pop/rock",
	"Musique de chambre",
	"Famille",
	"Concert",
	"Opéra (version de concert)",
	"Musique contemporaine",
	"Musique vocale",
	"Musique ancienne",
	"Chanson",
	"Voix",
	"famille",
];

const ORIGINAL_TOPIC_NAME_VALUES = [
	"Activité",
	"Type de public",
	"Genre",
	"Formations musicales",
];

const ORIGINAL_EVENT_NAMES = [
	"30th Anniversary Tour",
	"Berliner Philharmoniker",
	"Pittsburgh Symphony Orchestra",
	"Orchestre Philharmonique de Radio France",
	"WDR Sinfonieorchester Köln",
	"Alessandro - G.F. Haendel",
	"Orchestre Colonne",
	"Christophe",
	"Joshua Redman Quartet",
	"Orchestre Symphonique d'Etat de São Paulo",
	"Le génie italien",
	"Les Noces de Figaro - W.A. Mozart (version de concert)",
	"Orchestre Pasdeloup",
	"The Saxophone Summit",
	"Patricia Petibon - Nouveau Monde",
	"Russian National Orchestra",
	"Evgeny Kissin",
	"Bach, concertos pour piano",
	"Orchestre National d'Île-de-France",
	"Gewandhausorchester Leipzig",
	"Budapest Festival Orchestra",
	"Orchestre National du Capitole de Toulouse",
	"Remember Shakti",
	"Menahem Pressler - Quatuor Ebène",
	"Orquesta Buena Vista Social Club",
	"The Cleveland Orchestra",
	"Orchestre Philharmonique du Luxembourg",
	"Maurizio Pollini, piano",
	"Antonio Meneses - Maria-João Pires",
	"Musiques pour la reine Caroline",
	"Les Mystères d'Isis - W.A. Mozart (cersion de concert)",
	"Martha Argerich - Gidon Kremer",
	"Cecilia Bartoli - Mozart et la Vienne classique",
	"Orchestre du Théâtre Mariinsky",
	"Academy of Saint Martin in the Fields",
	"Quatuor Hagen",
	"Sunwook Kim, piano",
	"Orchestre National de France",
	"Messe en si mineur - J.S. Bach",
	"Le Messie - G.F. Haendel",
	"Ciné-concert - Le Cuirassé Potemkine",
	"London Symphony Orchestra",
	"Orquesta Sinfonica Simón Bolívar de Venezuela",
	"Edita Gruberova - Airs de concert",
	"Alexei Volodin, piano",
	"Sonya Yoncheva - Diva !",
	"Le Ramayana balinais - L'Enlèvement de Sita",
	"Dave Holland & friends",
	"Boris Godounov - M.Moussorgski (version de concert)",
	"Insula orchestra - Accentus",
	"Bryn Terfel - Héros légendaires",
	"Les Siècles",
	"Gautier Capuçon - Frank Braley",
	'Festival Présences 2014 "Paris Berlin"',
	"Autour de Tristan",
	"Etienne Daho et invités",
	"Fantasia in concert",
	"Khatia Buniatishvili, piano",
	"Guy Braunstein - Zvi Plesser - Sunwook Kim",
	"Janine Jansen and friends",
	"Elena Bashkirova, piano",
	"San Francisco Symphony",
	"Passion selon saint Jean - J.S. Bach",
	"Yundi Li , piano",
	"Orchestre du Conservatoire de Paris",
	"Royal Concertgebouw Orchestra Amsterdam",
	"Le Concert des Nations - Jordi Savall",
	"Leonidas Kavakos - Yuja Wang",
	"Quatuor Artemis - Gautier Capuçon",
	"Quatuor Artemis - Quatuor Ébène",
	"Quatuor Artemis - Elisabeth Leonskaja",
	"Passion selon saint Matthieu",
	"Les Arts Florissants - Concert de Pâques",
	"Leylâ et Majnûn ou L'Amour mystique",
	"Stephen Kovacevich, piano",
	"Orchestra Mozart Bologna - Mahler Chamber Orchestra",
	"Ballet Royal du Cambodge",
	"MDR Sinfonieorchester Leipzig",
	"Elisabeth Leonskaja, piano",
	"Yuja Wang, piano",
	"Anne-Sophie Mutter - Lambert Orkis",
	"Gilberto Gil",
	"Nelson Freire, piano",
	"Orfeo - C. Monteverdi (version de concert)",
	"Bamberger Symphoniker",
	"Murray Perahia, piano",
	"Krystian Zimerman, piano",
	"Rafal Blechacz, piano",
	"Les Voyages musicaux de Marco Polo",
	"Orchestre National de Lyon",
	"La Bohème - G. Puccini (version de concert)",
	"Otello - G. Verdi (version de concert)",
	"Staatskapelle Berlin",
	"Lou Doillon",
	"Patrick Watson & Orchestre National d'Ile-de-France",
	"Orchestre de Paris",
	"Paavo Järvi, direction",
	"Concert anniversaire des 90 ans de Menahem Pressler",
	"14052122 JARVI / GOERNE / SOLBERG / CHŒUR",
	"event secret 2",
	"event secret 3",
	"event secret 4",
	"event secret 5",
	"event secret 6",
];
