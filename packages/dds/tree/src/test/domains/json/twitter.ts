import { IRandom, makeRandom, SpaceEfficientMarkovChain } from "@fluid-internal/stochastic-test-utils";
import {
    createAlphabetFromUnicodeRange,
    getRandomEnglishString,
    getRandomNumberString,
    getSizeInBytes,
} from "./jsonGeneratorUtils";

/**
* This file contains logic to generate a JSON file that is statistically similar to the well-known
* json benchmarks twitter.json - https://github.com/serde-rs/json-benchmark/blob/master/data/twitter.json
*/

/* eslint-disable @rushstack/no-new-null */
export interface TwitterStatus {
    metadata: {
        result_type: string;
        iso_language_code: string;
    };
    created_at: string;
    id: number;
    id_str: string;
    text: string;
    source: string;
    truncated: boolean;
    in_reply_to_user_id: number | null;
    in_reply_to_user_id_str: string | null;
    in_reply_to_screen_name: string | null;
    user: TwitterUser;
    geo: null; // could not find an example of non null value
    coordinates: null; // could not find an example of non null value
    place: null; // could not find an example of non null value
    contributors: null; // could not find an example of non null value
    retweet_count: number;
    favorite_count: number;
    entities: {
        hashtags: {
            text: string;
            indices: number[];
        }[];
        symbols: unknown[]; // could not find a populated value from source json
        urls: {
            url: string;
            expanded_url: string;
            display_url: string;
            indices: number[];
        }[];
        user_mentions: {
            screen_name: string;
            name: string;
            id: number;
            id_str: string;
            indices: number[];
        }[];
        media?: {
            id: number;
            id_str: string;
            indices: number[];
            media_url: string;
            media_url_https: string;
            url: string;
            display_url: string;
            expanded_url: string;
            type: string;
            sizes: {
                large: {
                    w: number;
                    h: number;
                    resize: "fit" | "crop";
                };
                medium: {
                    w: number;
                    h: number;
                    resize: "fit" | "crop";
                };
                thumb: {
                    w: number;
                    h: number;
                    resize: "fit" | "crop";
                };
                small: {
                    w: number;
                    h: number;
                    resize: "fit" | "crop";
                };
            };
            source_status_id?: number;
            source_status_id_str?: string;
        }[];
    };
    favorited: boolean;
    retweeted: boolean;
    lang: string;
    retweeted_status?: Omit<TwitterStatus, "retweeted_status">;
    possibly_sensitive?: boolean;
    in_reply_to_status_id: number | null;
    in_reply_to_status_id_str: string | null;
}

export interface TwitterUser {
    id: number;
    id_str: string;
    name: string;
    screen_name: string;
    location: string;
    description: string;
    url: string | null;
    entities: {
        url?: {
            urls: {
                url: string;
                expanded_url: string;
                display_url: string;
                indices: number[];
            }[];
        };
        description: {
            urls: {
                url: string;
                expanded_url: string;
                display_url: string;
                indices: number[];
            }[];
        };
    };
    protected: boolean;
    followers_count: number;
    friends_count: number;
    listed_count: number;
    created_at: string;
    favourites_count: number;
    utc_offset: number | null;
    time_zone: string | null;
    geo_enabled: boolean;
    verified: boolean;
    statuses_count: number;
    lang: string;
    contributors_enabled: boolean;
    is_translator: boolean;
    is_translation_enabled: boolean;
    profile_background_color: string;
    profile_background_image_url: string;
    profile_background_image_url_https: string;
    profile_background_tile: boolean;
    profile_image_url: string;
    profile_image_url_https: string;
    profile_banner_url?: string;
    profile_link_color: string;
    profile_sidebar_border_color: string;
    profile_sidebar_fill_color: string;
    profile_text_color: string;
    profile_use_background_image: boolean;
    default_profile: boolean;
    default_profile_image: boolean;
    following: boolean;
    follow_request_sent: boolean;
    notifications: boolean;
}
/* eslint-enable */

export interface TwitterJson {
    statuses: TwitterStatus[];
    search_metadata: {
        completed_in: number;
        max_id: number;
        max_id_str: string;
        next_results: string;
        query: string;
        refresh_url: string;
        count: number;
        since_id: number;
        since_id_str: string;
    };
}

/**
* Generates a TwitterJson object as closely as possible to a specified byte size.
* The generated json will as close to the specified size but will almost always be slightly less.
* @param sizeInBytes - size to generate json object
* @param includeUnicode - true to include unicode in any strings within the json
* @param allowOversize - Allows the json to go over the sizeInBytes limit. If enabled, the
* generated json may be closer to the desired byte size but there is a risk of exceeding the inputted byte limit
* @returns TwitterJson
*/
export function generateTwitterJsonByByteSize(sizeInBytes: number, allowOversize: boolean, seed = 1) {
    const random = makeRandom(seed);
    const textFieldMarkovChain = new SpaceEfficientMarkovChain(random, getTwitterJsonTextFieldMarkovChain());
    const userDescFieldMarkovChain = new SpaceEfficientMarkovChain(random, getTwitterJsonUserDescFieldMarkovChain());
    const basicJapaneseAlphabetString = getBasicJapaneseAlphabetString();
    const twitterJson: TwitterJson = {
        statuses: [],
        search_metadata: {
            completed_in: 0.087,
            max_id: 505874924095815700,
            max_id_str: "505874924095815681",
            next_results: "?max_id=505874847260352512&q=%E4%B8%80&count=100&include_entities=1",
            query: "%E4%B8%80",
            refresh_url: "?since_id=505874924095815681&q=%E4%B8%80&include_entities=1",
            count: 100,
            since_id: 0,
            since_id_str: "0",
        },
    };

    let currentJsonSizeInBytes = getSizeInBytes(twitterJson);
    while (currentJsonSizeInBytes < sizeInBytes) {
        const twitterStatus = generateTwitterStatus(
            "standard", random, textFieldMarkovChain, userDescFieldMarkovChain, basicJapaneseAlphabetString,
        );
        const nextStatusSizeInBytes = getSizeInBytes(twitterStatus);
        if (!allowOversize && currentJsonSizeInBytes + nextStatusSizeInBytes > sizeInBytes) {
            break;
        }
        twitterJson.statuses.push(twitterStatus);
        currentJsonSizeInBytes += nextStatusSizeInBytes;
    }

    return twitterJson;
}

/**
* Generates a TwitterJson object containing exactly the number specified statuses.
* @param numStatuses - number of statuses to include in the generated TwitterJson
* @param includeUnicode - true to include unicode in any strings within the json
* @returns TwitterJson
*/
export function generateTwitterJsonByNumStatuses(numStatuses: number, seed = 1) {
    const random = makeRandom(seed);
    const textFieldMarkovChain = new SpaceEfficientMarkovChain(random, getTwitterJsonTextFieldMarkovChain());
    const userDescFieldMarkovChain = new SpaceEfficientMarkovChain(random, getTwitterJsonUserDescFieldMarkovChain());
    const basicJapaneseAlphabetString = getBasicJapaneseAlphabetString();
    const twitterJson: TwitterJson = {
        statuses: [],
        search_metadata: {
            completed_in: 0.087,
            max_id: 505874924095815700,
            max_id_str: "505874924095815681",
            next_results: "?max_id=505874847260352512&q=%E4%B8%80&count=100&include_entities=1",
            query: "%E4%B8%80",
            refresh_url: "?since_id=505874924095815681&q=%E4%B8%80&include_entities=1",
            count: 100,
            since_id: 0,
            since_id_str: "0",
        },
    };

    for (let i = 0; i < numStatuses; i++) {
        twitterJson.statuses.push(
            generateTwitterStatus(
                "standard", random, textFieldMarkovChain, userDescFieldMarkovChain, basicJapaneseAlphabetString,
            ),
        );
    }

    return twitterJson;
}

/* eslint-disable no-useless-escape */
function generateTwitterStatus(type: "standard" | "retweet", random: IRandom,
    textFieldMarkovChain: SpaceEfficientMarkovChain, userDescFieldMarkovChain: SpaceEfficientMarkovChain,
    alphabet: string) {
    // id is always an 18 digit number
    const statusIdString = getRandomNumberString(random, 18, 18);
    const retweetCount = Math.floor(random.integer(0, 99999));
    const favoriteCount = Math.floor(random.integer(0, 99999));
    const twitterUser = generateTwitterUser(random, userDescFieldMarkovChain, alphabet);
    // The following boolean values mirror the statistical probability of the original json
    const shouldAddHashtagEntity = type === "standard" ? random.bool(0.07) : random.bool(0.027397);
    const shouldAddUrlEntity = type === "standard" ? random.bool(0.12) : random.bool(0.068493);
    const shouldAddUserMentionsEntity = type === "standard" ? random.bool(0.12) : random.bool(0.068493);
    const shouldAddMediaEntity = type === "standard" ? random.bool(0.06) : random.bool(0.0547945);
    const shouldAddInReplyToStatusId = type === "standard" ? random.bool(0.06) : random.bool(0.027397);
    // in reply to screen name & in reply to user id always appear together
    const shouldAddInReplyToUserIdAndScreenName = type === "standard" ? random.bool(0.09) : random.bool(0.041095);

    const twitterStatus: any = {
        metadata: {
            result_type: "recent",
            iso_language_code: "ja",
        },
        created_at: getRandomDateString(random, new Date("2005-01-01"), new Date("2022-01-01")),
        id: Number(statusIdString),
        id_str: `${statusIdString}`,
        text: textFieldMarkovChain.generateSentence(144), // average length the original json text field is 123
        // source can have unicode nested in it
        source: `<a href=\"https://twitter.com/${twitterUser.screen_name}\" rel=\"nofollow\">
         ${random.string(random.integer(2, 30), alphabet)}</a>`,
        truncated: true, // no examples found where truncated was false
        user: twitterUser,
        // could not find an example of non null value for these 4 values (geo, coordinaes, place, contributors)
        geo: null,
        coordinates: null,
        place: null,
        contributors: null,
        possibly_sensitive: random.bool(),
        retweet_count: retweetCount,
        favorite_count: favoriteCount,
        entities: {
            hashtags: [],
            symbols: [],
            urls: [],
            user_mentions: [],
        },
        favorited: retweetCount > 0 ? true : false,
        retweeted: favoriteCount > 0 ? true : false,
        lang: "ja",
    };
    if (type === "standard") {
        const shouldAddRetweet = random.bool(0.73);
        if (shouldAddRetweet) {
            twitterStatus.retweeted_status =
                generateTwitterStatus("retweet", random, textFieldMarkovChain, userDescFieldMarkovChain, alphabet);
        }
    }
    if (shouldAddInReplyToStatusId) {
        const inReplyToStatusId = getRandomNumberString(random, 18, 18);
        twitterStatus.in_reply_to_status_id = inReplyToStatusId !== null ? Number(inReplyToStatusId) : null;
        twitterStatus.in_reply_to_status_id_str = inReplyToStatusId !== null ? inReplyToStatusId : null;
    }
    if (shouldAddInReplyToUserIdAndScreenName) {
        const inReplyToUserId = getRandomNumberString(random, 10, 10);
        twitterStatus.in_reply_to_user_id = inReplyToUserId !== null ? Number(inReplyToUserId) : null;
        twitterStatus.in_reply_to_user_id_str = inReplyToUserId !== null ? inReplyToUserId : null;
        twitterStatus.in_reply_to_screen_name = getRandomEnglishString(random, false, 6, 30);
    }

    if (shouldAddHashtagEntity) {
        twitterStatus.entities.hashtags.push({
            text: random.string(random.integer(2, 30), alphabet),
            indices: [
                Math.floor(random.integer(0, 199)),
                Math.floor(random.integer(0, 199)),
            ],
        });
    }
    if (shouldAddUrlEntity) {
        twitterStatus.entities.urls.push({
            url: "http://t.co/ZkU4TZCGPG",
            expanded_url: "http://www.tepco.co.jp/nu/fukushima-np/review/images/review1_01.gif",
            display_url: "tepco.co.jp/nu/fukushima-n…",
            indices: [
                Math.floor(random.integer(0, 199)),
                Math.floor(random.integer(0, 199)),
            ],
        });
    }
    if (shouldAddUserMentionsEntity) {
        const userId = getRandomNumberString(random, 10, 10);
        twitterStatus.entities.user_mentions.push({
            screen_name: getRandomEnglishString(random, true, 6, 30),
            name: random.string(random.integer(2, 30), alphabet),
            id: Number(userId),
            id_str: userId,
            indices: [
                Math.floor(random.integer(0, 199)),
                Math.floor(random.integer(0, 199)),
            ],
        });
    }
    if (shouldAddMediaEntity) {
        const mediaStatusIdString = getRandomNumberString(random, 18, 18);
        const shouldAddSourceIdData = random.bool();
        const mediaEntity: any = {
            id: Number(mediaStatusIdString),
            id_str: "statusIdString",
            indices: [
                Math.floor(random.integer(0, 199)),
                Math.floor(random.integer(0, 199)),
            ],
            media_url: "http://pbs.twimg.com/media/BwU6g-dCcAALxAW.png",
            media_url_https: "https://pbs.twimg.com/media/BwU6g-dCcAALxAW.png",
            url: "http://t.co/okrAoxSbt0",
            display_url: "pic.twitter.com/okrAoxSbt0",
            expanded_url: "http://twitter.com/waraeru_kan/status/505874871616671744/photo/1",
            type: "photo",
            sizes: {
                small: {
                    w: 340,
                    h: 425,
                    resize: "fit",
                },
                thumb: {
                    w: 150,
                    h: 150,
                    resize: "crop",
                },
                large: {
                    w: 600,
                    h: 750,
                    resize: "fit",
                },
                medium: {
                    w: 600,
                    h: 750,
                    resize: "fit",
                },
            },
        };

        if (shouldAddSourceIdData) {
            mediaEntity.source_status_id_str = getRandomNumberString(random, 18, 18);
            mediaEntity.source_status_id = Number(mediaEntity.source_status_id_str);
        }
        twitterStatus.entities.media = [mediaEntity];
    }

    return twitterStatus as TwitterStatus;
}

function generateTwitterUser(random: IRandom, userDescFieldMarkovChain: SpaceEfficientMarkovChain,
    alphabet: string): TwitterUser {
    const userId = getRandomNumberString(random, 10, 10);
    const shouldAddUrlUrlsEntity = random.bool();
    const shouldAddDescriptionUrlsEntity = random.bool();
    const shouldAddUtcOffsetAndtimezone = random.bool();
    const user: TwitterUser = {
        id: Number(userId),
        id_str: userId,
        name: random.string(random.integer(2, 30), alphabet),
        // screen names do not include unicode characters
        screen_name: getRandomEnglishString(random, false, 6, 30),
        location: "",
        description: userDescFieldMarkovChain.generateSentence(144),
        url: null,
        entities: {
            // This always appears on a user, even if its empty.
            description: {
                urls: [],
            },
        },
        protected: false,
        followers_count: random.integer(0, 9999),
        friends_count: random.integer(0, 9999),
        listed_count: 2,
        created_at: getRandomDateString(random, new Date("2005-01-01"), new Date("2022-01-01")),
        favourites_count: 0,
        utc_offset: shouldAddUtcOffsetAndtimezone ? 32400 : null,
        time_zone: shouldAddUtcOffsetAndtimezone ? "Tokyo" : null,
        geo_enabled: random.bool(),
        verified: random.bool(),
        statuses_count: Math.floor(random.integer(0, 9999)),
        lang: "ja",
        contributors_enabled: random.bool(),
        is_translator: random.bool(),
        is_translation_enabled: random.bool(),
        profile_background_color: getRandomEnglishString(random, true, 6, 6),
        profile_background_image_url: "http://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_image_url_https: "https://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_tile: random.bool(),
        profile_image_url: "http://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_image_url_https: "https://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_banner_url: "https://pbs.twimg.com/profile_banners/2699365116/1406936481",
        profile_link_color: getRandomEnglishString(random, true, 6, 6),
        profile_sidebar_border_color: getRandomEnglishString(random, true, 6, 6),
        profile_sidebar_fill_color: getRandomEnglishString(random, true, 6, 6),
        profile_text_color: getRandomEnglishString(random, true, 6, 6),
        profile_use_background_image: random.bool(),
        default_profile: random.bool(),
        default_profile_image: random.bool(),
        following: random.bool(),
        follow_request_sent: random.bool(),
        notifications: random.bool(),
    };
    if (shouldAddUrlUrlsEntity) {
        user.entities.url = {
            urls: [
                {
                    url: "http://t.co/V4oyL0xtZk",
                    expanded_url: "http://astore.amazon.co.jp/furniturewood-22",
                    display_url: "astore.amazon.co.jp/furniturewood-…",
                    indices: [
                        random.integer(0, 199),
                        random.integer(0, 199),
                    ],
                },
            ],
        };
    }
    if (shouldAddDescriptionUrlsEntity) {
        user.entities.description.urls.push(
            {
                url: "http://t.co/8E91tqoeKX",
                expanded_url: "http://ameblo.jp/2no38mae/",
                display_url: "ameblo.jp/2no38mae/",
                indices: [
                    random.integer(0, 199),
                    random.integer(0, 199),
                ],
            },
        );
    }

    return user;
}
/* eslint-enable */

function getBasicJapaneseAlphabetString() {
    // Japanese Hiragana
    return createAlphabetFromUnicodeRange(0x3041, 0x3096) +
        // Japanese Katakana (Full Width)
        createAlphabetFromUnicodeRange(0x30A0, 0x30FF) +
        // Japanese Kanji Alphabet (CJK Unified Ideographs)
        createAlphabetFromUnicodeRange(0x3400, 0x4DB5) +
        createAlphabetFromUnicodeRange(0x4E00, 0x9FCB) +
        createAlphabetFromUnicodeRange(0xF900, 0xFA6A);
}

// This is specifically formatted like the twitter json dates
// (<3-letter-weekday> MMM DD HH:MM:SS <4-digit-TimezoneOffset> YYYY)
function getRandomDateString(random = makeRandom(), start: Date, end: Date) {
    const dateS = new Date(random.integer(+start, +end)).toString();
    return `${dateS.substring(0, 10)} ${dateS.substring(16, 24)} ` +
        `${dateS.substring(28, 33)} ${dateS.substring(11, 15)}`;
}

// Source for unicode ranges:
// https://stackoverflow.com/questions/19899554/
// unicode-range-for-japanese#:~:text=To%20summarize%20the%20ranges%3A,Katakana%20(%2030a0%20%2D%2030ff)
// or more direct source:
// http://www.localizingjapan.com/blog/2012/01/20/regular-expressions-for-japanese-text/
export function isJapanese(ch: string) {
    // Japanese Hiragana
    return (ch >= "\u3041" && ch <= "\u3096"
        // Japanese Katakana (Full Width)
        || ch >= "\u30A0" && ch <= "\u30FF"
        // Japanese Kanji Alphabet (CJK Unified Ideographs)
        || ch >= "\u3400" && ch <= "\u4DB5"
        || ch >= "\u4E00" && ch <= "\u9FCB"
        || ch >= "\uF900" && ch <= "\uFA6A"
        // Kanji Radicals
        || ch >= "\u2E80" && ch <= "\u2FD5"
        // Katakana and Punctuation (Half Width)
        || ch >= "\uFF5F" && ch <= "\uFF9F"
        // Miscellaneous Japanese Symbols and Characters
        || ch >= "\u31F0" && ch <= "\u31FF"
        || ch >= "\u3220" && ch <= "\u3243"
        || ch >= "\u3280" && ch <= "\u337F");
}

export function isAlphaLatin(ch: string) {
    // range 1: ABCDEFGHIJKLMNO0050PQRSTUVWXYZ
    return (ch >= "\u0041" && ch <= "\u005A")
        // range 2: abcdefghijklmnopqrstuvwxyz
        || (ch >= "\u0061" && ch <= "\u007A");
}

export function isSymbol(ch: string) {
    // range 1: !"#$%&'()*+,-./
    return (ch >= "\u0021" && ch <= "\u002F")

        // Range 2: :;<=>?@
        || (ch >= "\u003A" && ch <= "\u0041");
}

export function isEscapeChar(ch: string) {
    return (ch >= "\u0080" && ch <= "\u00A0") || (ch >= "\u0000" && ch <= "\u0010");
}

export function isJapaneseSymbolOrPunctuation(ch: string) {
    return (ch >= "\u3000" && ch <= "\u303F");
}

/**
 * This method creates an array of sentences where a sentence is an array of words. Its intended use is with creating a
 * markovChain. (See the MarkovChain class).
 *
 * Japanese is not space separated but individual characters are counted as words here words.
 * We count a series of english charaters, numbers, symbols or escape characters without spaces in between as a word.
 * 1. we will first space separate the text,
 * 2. we will iterate over each character in each space separated word.
 * 2a. If the char is a Japanese it will be counted as a complete word.
 * 2b. If the characters are alpha latin, escapes or line breaks we will count it as part of a word,
 *  adding each next chars until we get to either a Japanese character or a space.
 */
export function parseSentencesIntoWords(inputSentences: string[]) {
    const outputSentences: string[][] = [];
    inputSentences.forEach((inputSentence) => {
        const sentenceWords: string[] = [];
        const spaceSeparatedWords: string[] = inputSentence.split(" ");
        spaceSeparatedWords.forEach((potentialWord) => {
            const innerWords: string[] = [];
            let previousChar: string | null = null;
            let currentWord = "";
            for (let i = 0; i < potentialWord.length; i++) {
                const currentChar = potentialWord.charAt(i);
                if (isEscapeChar(currentChar) || isJapaneseSymbolOrPunctuation(currentChar)) {
                    if (previousChar && !isEscapeChar(previousChar) || isJapaneseSymbolOrPunctuation(currentChar)) {
                        innerWords.push(`${currentWord}`);
                        currentWord = currentChar;
                    } else {
                        currentWord += currentChar;
                    }
                } else if (isAlphaLatin(currentChar)) {
                    currentWord += currentChar;
                } else if (isJapanese(currentChar)) {
                    if (currentWord.length > 0) {
                        innerWords.push(`${currentWord}`);
                    }
                    innerWords.push(`${currentChar}`);
                    currentWord = "";
                } else {
                    currentWord += currentChar;
                }
                previousChar = currentChar;
            }

            if (currentWord.length > 0) {
                innerWords.push(currentWord);
            }
            innerWords.forEach((word) => sentenceWords.push(word));
        });

        outputSentences.push(sentenceWords);
    });

    return outputSentences;
}

/* eslint-disable max-len, @typescript-eslint/comma-dangle */
export function getTwitterJsonTextFieldMarkovChain() {
    return JSON.parse(
        "{\"1\":{\"日\":2},\"8\":{\"月\":2},\"9\":{\"月\":2},\"13\":{\"時\":1},\"30\":{\"分\":1},\"31\":{\"日\":3},\"480\":{\"匹\":1},\"MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#\":{\"RT\":73,\"@longhairxMIURA\":1,\"【\":3,\"お\":1,\"@ran_kirazuki\":1,\"一\":1,\"今\":1,\"@kohecyan3\":1,\"第\":1,\"レッドクリフ\":1,\"す\":1,\"【H15-9-4】\":1,\"四\":2,\"@Take3carnifex\":1,\"爆\":1,\"@nasan_arai\":1,\"\\\"ソードマスター\\\"\":1,\"闇\":1,\"\\\"@BelloTexto:\":1,\"@kaoritoxx\":1,\"@itsukibot_\":1,\"天\":1,\"@vesperia1985\":1,\"【マイリスト】【\":1},\"@aym0566x\":{\"\\n\\n\":1},\"\\n\\n\":{\"名\":1},\"名\":{\"前\":3,\"貪\":1},\"前\":{\":\":2,\"田\":1,\"は\":1,\"へ\":116,\"→\":1,\"日\":1},\":\":{\"前\":1,\"な\":1,\"と\":1,\"照\":1,\"上\":1,\"ず\":1,\"過\":1,\"大\":1,\"\\n\":4,\"\\n#RT\":1,\"　　\":2},\"田\":{\"あ\":1,\"舎\":1,\"新\":1,\"准\":1},\"あ\":{\"ゆ\":1,\"ふ\":1,\"っ\":1},\"ゆ\":{\"み\":1},\"み\":{\"\":1,\"合\":1,\"て\":1,\"る\":1,\"た\":2,\"に\":1},\"\":{\"\\n\":6,\"\\n　※\":1,\"\\nhttp://t.co/jRWJt8IrSB\":1,\"\\nhttp://t.co/fXIgRt4ffH\":1},\"\\n\":{\"第\":6,\"今\":6,\"好\":4,\"思\":1,\"一\":10,\"漢\":1,\"呼\":5,\"家\":2,\"最\":3,\"光\":1,\"名\":2,\"ち\":1,\"だ\":1,\"ど\":1,\"是\":1,\"先\":1,\"敵\":1,\"二\":1,\"執\":1,\"闇\":1,\"\\n#キンドル\":1},\"第\":{\"一\":14},\"一\":{\"印\":5,\"言\":5,\"生\":2,\"同\":2,\"ライカス\":1,\"本\":1,\"文\":1,\"地\":1,\"で\":2,\"関\":1,\"、\":2,\"つ\":1,\"に\":58,\"番\":58,\"雨\":1,\"を\":2,\"高\":1,\"踏\":1,\"や\":2,\"三\":1,\"眼\":2,\"科\":1,\"\":1,\"の\":1,\"原\":2,\"场\":2,\"大\":1,\"問\":1,\"答\":1,\"決\":1,\"師\":1,\"流\":1,\"号\":1,\"\\\"No\":6,\"稀\":1,\"水\":1,\"世\":1,\"名\":1,\"　\":1},\"印\":{\"象\":10},\"象\":{\":\":5,\"☞\":1,\"☞お\":1,\":バーバリー\":1,\"台\":2,\"→\":1,\"→れいら♡\":1},\"な\":{\"ん\":59,\"い\":10,\"と\":4,\"😘✨\":1,\"一\":1,\"い←\":1,\"お\":1,\"っ\":1,\"😳\":1,\"ら☞お\":1,\"い…\":1,\"ら\":2,\"る\":59,\"も\":58,\"〜\":1,\"「\":1,\"俺\":1,\"ら:\":1,\"い）クラスメイト\":1,\"さ\":1,\"い。→\":1,\"ー\":2,\"交\":1,\"の\":1,\"く\":1,\"情\":1},\"ん\":{\"か\":1,\"の\":2,\"で\":60,\"家\":1,\"\\n\":4,\"て\":58,\"ど\":58,\"大\":58,\"に\":2,\"張\":1,\"こ\":1,\"天\":1,\"好\":1,\"だ\":1,\"ね\":2,\"み\":1},\"か\":{\"怖\":1,\"ら\":3,\"な\":2,\"ら？！\":1,\"り\":58,\"い\":2,\"言\":1,\"わ\":1,\"っ\":3,\"ら２\":1,\"える\":1,\"く\":1,\"風\":1,\"…」\":2,\"せ\":1,\"ん\":1},\"怖\":{\"っ\":1},\"っ\":{\"！\":1,\"そ\":1,\"て\":14,\"た\":8,\"ぽ\":1,\"と\":1,\"…\":1},\"！\":{\"\\n\":3,\"http://t.co/FzTyFnt9xH”\":1,\"\\nhttp://t.co…\":1,\"一\":1,\"命\":1,\"毎\":1,\"在\":1},\"今\":{\"の\":5,\"こ\":1,\"日\":2,\"ま\":1,\"天\":2},\"の\":{\"印\":5,\"ダチ💖\":1,\"と\":1,\"スペース\":1,\"見\":1,\"DVD\":1,\"よう\":1,\"雨\":1,\"足\":1,\"指\":2,\"第\":1,\"年\":58,\"を\":58,\"で\":59,\"は\":58,\"場\":58,\"…\":58,\"申\":1,\"再\":1,\"皆\":1,\"カロリー\":1,\"た\":1,\"\":1,\"時\":1,\"自\":1,\"？\":1,\"調\":1,\"キャラ\":1,\"こ\":1,\"区\":1,\"拓\":1,\"際\":1,\"妨\":2,\"方\":1,\"ラ…\":1,\"秘\":1,\"敷\":1,\"排\":1,\"構\":1,\"ツメ\":1,\"甘\":1,\"センスを\":1,\"アスタリスク\":1,\"称\":1,\"剣\":1,\"師\":1,\"武\":1,\"差\":1,\"生\":1,\"俺\":1,\"ソーセージをペロペロ\":1,\"標\":2,\"０\":1,\"ゼロ）　\":1,\"新\":1,\"商\":1,\"現\":1,\"ランク\":1},\"と\":{\"りあえ\":1,\"こ\":6,\"な\":2,\"い\":1,\"小\":1,\"は\":2,\"う\":2,\"書\":58,\"いう\":174,\"、\":58,\"祈\":1,\"三\":1,\"か\":3,\"し\":1,\"思\":1,\"や\":1,\"女\":1,\"に\":1,\"生\":1,\"FB\":1,\"付\":1,\"る\":1,\"九\":1},\"りあえ\":{\"ず\":1},\"ず\":{\"キモい。\":1,\"バック\":1,\"る\":1},\"キモい。\":{\"噛\":1},\"噛\":{\"み\":1},\"合\":{\"わ\":1,\"唱\":1,\"（\":1,\"う\":1},\"わ\":{\"な\":1,\"\\n\":1},\"い\":{\"\\n\":3,\"出\":1,\"田\":1,\"と\":59,\"け\":1,\"ま\":5,\"た\":1,\"て\":120,\"く\":58,\"こ\":58,\"体\":2,\"か\":3,\"す\":1,\"し\":1,\"つ\":1,\"が\":1,\"夢\":1,\"手\":1,\"優\":3,\"事\":1,\"っ\":2},\"好\":{\"き\":5,\"ん\":1,\"】ペンタックス・デジタル\":1},\"き\":{\"な\":5,\"る？:あぁ……\":1,\"止\":1,\"て\":59,\"去\":58,\"そ\":1,\"た\":1,\"る？→\":1,\"〜(´･_･`)♡GEM\":1,\"合\":1},\"こ\":{\"ろ:\":2,\"😋✨✨\":1,\"と\":62,\"ろ\":1,\"の\":61,\"ろ:あ\":1,\"盛\":1,\"ち\":1,\"ろ→\":1},\"ろ:\":{\"ぶ\":1,\"\\n\":1},\"ぶ\":{\"す\":1,\"ん\":1},\"す\":{\"で\":1,\"ぎ\":1,\"が\":2,\"ん♪\":1,\"る\":6,\"！“@8CBR8:\":1,\"！\":3,\"アピール\":1,\"ご\":1,\"…」\":1,\"る(°_°)！\":1,\"よ…！！\":1},\"で\":{\"キモい\":1,\"き\":3,\"帰\":1,\"行\":1,\"Uターン\":1,\"500メートル\":1,\"進\":1,\"届\":1,\"いー\":1,\"は\":2,\"知\":58,\"し\":116,\"す\":3,\"、\":1,\"柏\":1,\"「\":1,\"キープ\":1,\"、「\":1,\"も\":2,\"面\":1,\"あり、\":1,\"ね\":1,\"な\":1},\"キモい\":{\"と\":1},\"😋✨✨\":{\"\\n\":1},\"思\":{\"い\":1,\"っ\":1,\"うよう\":1},\"出\":{\":んーーー、あり\":1,\"→\":1,\"来\":2,\"を\":1},\":んーーー、あり\":{\"す\":1},\"ぎ\":{\"😊❤️\":1},\"😊❤️\":{\"\\nLINE\":1},\"\\nLINE\":{\"交\":3},\"交\":{\"換\":3,\"際\":1},\"換\":{\"で\":2,\"☞\":1},\"る？:あぁ……\":{\"ご\":1},\"ご\":{\"め\":1,\"ざ\":3,\"ろ\":1,\"く\":1},\"め\":{\"ん✋\":1,\"る\":3,\"奉\":1,\"の\":58,\"に\":1,\"られ\":1},\"ん✋\":{\"\\nトプ\":1},\"\\nトプ\":{\"画\":2},\"画\":{\"を\":1,\"に\":1,\"　40\":1,\"パンフレット】　\":1},\"を\":{\"み\":1,\"頂\":1,\"持\":2,\"崇\":1,\"好\":1,\"置\":58,\"踊\":2,\"容\":1,\"抑\":1,\"送\":1,\"選\":2,\"利\":1,\"求\":1,\"認\":1,\"見\":1},\"て\":{\"480\":1,\":\":1,\"っ\":1,\"言\":1,\"帰\":1,\"迷\":1,\"姉\":1,\"るん\\\\(\":1,\"☞\":1,\"、\":177,\"いる\":60,\"い\":59,\"ま\":1,\"き\":2,\"下\":2,\"大\":1,\"る〜(*^^*)！\":1,\"み\":2,\"寝\":1,\"く\":1,\"（\":1,\"た\":1,\"ん\":1,\"道\":1,\"も\":1,\"る(｢･ω･)｢\":1,\"「\":1,\"歳\":1,\"おる。い\":1,\"る\":1,\"いい\":1,\"は\":1},\"照\":{\"れ\":1},\"れ\":{\"ま\":1,\"は\":3,\"方\":3,\"が\":1,\"か\":1,\"な\":1,\"で\":1,\"た\":1,\"て\":2},\"ま\":{\"す\":7,\"り\":1,\"で\":61,\"な\":1,\"お\":1,\"る\":58,\"せ\":59,\"だ\":1,\"さ\":1,\"し\":1,\"ろう\":1,\"職\":1},\"が\":{\"な\":2,\"家\":1,\"つ\":1,\"朝\":1,\"と\":1,\"、\":1,\"ダイエット\":1,\"普\":1,\"絶\":1,\"北\":1,\"あ\":2,\"い\":1,\"開\":1,\"連\":1,\"人\":1,\"…！」\":1,\"こ\":1,\"取\":1,\"す\":1},\"😘✨\":{\"\\n\":1},\"言\":{\":お\":1,\"う\":1,\"葉\":1,\"☞\":1,\"っ\":1,\":\":2,\"→\":1},\":お\":{\"前\":1},\"は\":{\"一\":3,\"・・・（\":1,\"よう\":1,\"……！\":1,\"な\":1,\"生\":58,\"、\":59,\"ま\":1,\"1900kcal」\":1,\"い\":3,\"満\":1,\"普\":1,\"反\":1,\"で\":1,\"大\":1,\"僕\":1,\"そ\":1,\"デカイ\":1,\"よー！\":1,\"、アートフレーム...\":1},\"生\":{\"も\":1,\"き\":58,\"开\":2,\"の\":1,\"徒\":2,\"来\":1},\"も\":{\"ん\":2,\"行\":1,\"っ\":1,\"の\":116,\"う\":1,\"ど\":1,\"、１\":1,\"話\":1,\"尊\":1,\"いろいろ\":1},\"ダチ💖\":{},\"RT\":{\"@KATANA77:\":1,\"@omo_kko:\":1,\"@thsc782_407:\":1,\"@AFmbsk:\":1,\"@shiawaseomamori:\":58,\"@POTENZA_SUPERGT:\":1,\"@UARROW_Y:\":2,\"@assam_house:\":1,\"@Takashi_Shiina:\":1,\"@naopisu_:\":1,\"@oen_yakyu:\":1,\"@Ang_Angel73:\":1,\"@takuramix:\":1,\"@siranuga_hotoke:\":1,\"@fightcensorship:\":1},\"@KATANA77:\":{\"え\":1},\"え\":{\"っ\":1,\"な\":3,\"て\":1,\"続\":1,\"ば\":1},\"そ\":{\"れ\":4,\"の\":1,\"う\":4,\"わろ\":1,\"うよ！あ\":1},\"・・・（\":{\"一\":1},\"同\":{\"）\":1,\"意\":1,\"「……………。」\":1},\"）\":{\"http://t.co/PkCJAcSuYK\":1},\"http://t.co/PkCJAcSuYK\":{},\"@longhairxMIURA\":{\"朝\":1},\"朝\":{\"一\":3},\"ライカス\":{\"辛\":1},\"辛\":{\"目\":1},\"目\":{\"だ\":1,\"が\":1},\"だ\":{\"よw\":1,\"な\":58,\"け\":1,\"与\":1,\"！」\":1,\"れ\":1,\"っ\":1,\"と\":1,\"よ。\":1,\"よ\":1},\"よw\":{},\"@omo_kko:\":{\"ラウワン\":1},\"ラウワン\":{\"脱\":1},\"脱\":{\"出\":1},\"→\":{\"友\":1,\"墓\":1,\"な\":2,\"誰\":1},\"友\":{\"達\":3},\"達\":{\"が\":1,\"ん\":1,\"おろ\":1},\"家\":{\"に\":2,\"族\":2},\"に\":{\"連\":1,\"乗\":1,\"「ハウステンボス」を\":1,\"つ\":2,\"す\":2,\"一\":4,\"身\":1,\"し\":61,\"止\":58,\"な\":59,\"正\":58,\"ある\":58,\"会\":1,\"必\":2,\"、\":1,\"私\":1,\"行\":1,\"や\":4,\"陸\":1,\"ヨセアツメ\":1,\"取\":1,\"か\":1,\"基\":1,\"対\":1,\"関\":2,\"受\":1,\"当\":1,\"も\":1,\"い\":1,\"平\":1},\"連\":{\"ん\":1,\"れ\":1},\"帰\":{\"っ\":1,\"る(1\":1},\"う\":{\"か\":1,\"ご\":2,\"で\":2,\"一\":1,\"ぞ\":1,\"見\":1,\"ち\":1,\"に\":1,\"思\":1,\"だ\":1},\"ら\":{\"友\":1,\"な\":1,\"人\":1,\"し\":1,\"や\":1,\"も\":1},\"乗\":{\"せ\":1},\"せ\":{\"て\":1,\"ん\":58,\"られ\":1,\"ん。\":1,\"た\":1,\"焼\":1},\"る(1\":{\"度\":1},\"度\":{\"も\":1},\"行\":{\"っ\":2,\"き\":1,\"妨\":1,\"為\":1,\"部\":1},\"た\":{\"こ\":1,\"〜（≧∇≦）\":1,\"。\":60,\"だ\":1,\"知\":1,\"め\":1,\"の\":1,\"人\":3,\"www\":1,\"(\":1,\"り\":2,\"り、\":1,\"実\":1,\"楽\":1,\"赤\":1,\"い\":1,\"っ\":1,\"ん\":1,\"らシメる\":1,\"ら×\":1,\"し\":1,\"？？\":1,\"【\":1},\"舎\":{\"道\":1},\"道\":{\")→\":1,\"進\":1,\"路\":2,\"の\":1},\")→\":{\"友\":1},\"おろ\":{\"し\":1},\"し\":{\"て\":67,\"そ\":1,\"い\":120,\"た\":62,\"ょ\":58,\"ま\":1,\"よう\":1,\"い　　　　　\":1,\"か\":1,\"右\":1,\"、\":1,\"隊\":1,\"は\":1,\"い、、、\":1},\"迷\":{\"子\":1},\"子\":{\"→500メートル\":1,\"で\":1,\"や\":1,\"。\":2},\"→500メートル\":{\"く\":1},\"く\":{\"らい\":1,\"変\":1,\"も\":58,\"て\":3,\"そ\":1,\"面\":1,\"っ\":1},\"らい\":{\"続\":1},\"続\":{\"く\":1,\"け\":1,\"試\":1},\"変\":{\"な\":1,\"！\":1},\"本\":{\"道\":1,\"当\":58},\"進\":{\"む\":1,\"ま\":1},\"む\":{\"→\":1},\"墓\":{\"地\":1},\"地\":{\"で\":1,\"区\":1,\"所\":1,\"図\":1,\"江\":2,\"将\":4,\"东\":2,\"今\":2},\"止\":{\"ま\":59},\"り\":{\"で\":1,\"と\":2,\"ま\":58,\"急\":58,\"に\":58,\"会\":1,\"の\":1,\"だ\":1,\"締\":1},\"Uターン\":{\"出\":1},\"来\":{\"ず\":1,\"る\":1,\"一\":2,\"な\":1},\"バック\":{\"で\":1},\"500メートル\":{\"元\":1},\"元\":{\"の\":1,\"に\":1},\"ろ\":{\"ま\":1,\"一\":1,\"し\":1},\"け\":{\"な\":1,\"が\":1,\"る\":1,\"で\":1,\"て\":1,\"た\":1,\"と\":1,\"！！wあー、\":1},\"い←\":{\"今\":1},\"@thsc782_407:\":{\"#LEDカツカツ\":1},\"#LEDカツカツ\":{\"選\":1},\"選\":{\"手\":1,\"択\":2},\"手\":{\"権\":1,\"元\":1},\"権\":{\"\":1,\"利\":1},\"漢\":{\"字\":1},\"字\":{\"一\":1,\"ぶ\":1},\"文\":{\"字\":1},\"スペース\":{\"に\":1},\"「ハウステンボス」を\":{\"収\":1},\"収\":{\"め\":1},\"る\":{\"狂\":1,\"と\":59,\"な\":2,\"ま\":58,\"こ\":2,\"国\":2,\"意\":1,\"か\":1,\"\\n\":1,\"笑\":1,\"\\n\\nお\":1,\"利\":1,\"人\":1,\"一\":1,\"気\":1,\"ほ\":1,\"も\":1,\"音\":1,\"正\":1},\"狂\":{\"気\":1},\"気\":{\"http://t.co/vmrreDMziI\":1,\"持\":58,\"が\":1},\"http://t.co/vmrreDMziI\":{},\"【\":{\"金\":1,\"状\":1,\"大\":1,\"映\":1,\"反\":1},\"金\":{\"一\":1},\"区\":{\"太\":1,\"別\":1},\"太\":{\"鼓\":1,\"郎\":1},\"鼓\":{\"台\":1},\"台\":{\"】\":1,\"消\":2},\"】\":{\"川\":1,\"http://t.co/PjL9if8OZC\":1},\"川\":{\"関\":1,\"の\":1,\"盆\":4,\"光\":1,\"一\":1},\"関\":{\"と\":1,\"節\":1,\"わり\":1,\"す\":1},\"小\":{\"山\":1,\"学\":2,\"川\":1},\"山\":{\"の\":1,\"崎\":1},\"見\":{\"分\":1,\"英\":2,\"を\":1,\"た\":1,\"て\":1,\"る:\":1},\"分\":{\"け\":1,\"～\":1},\"つ\":{\"か\":1,\"い\":2,\"簡\":1,\"天\":1,\"剣\":1},\"お\":{\"は\":2,\"言\":1,\"ち\":1},\"よう\":{\"ご\":1,\"な\":1,\"か\":2,\"と\":1},\"ざ\":{\"い\":3},\"ん♪\":{\"SSDS\":1},\"SSDS\":{\"の\":1},\"DVD\":{\"が\":1},\"届\":{\"い\":1},\"〜（≧∇≦）\":{},\"@ran_kirazuki\":{\"そ\":1},\"葉\":{\"を\":1},\"頂\":{\"け\":1},\"……！\":{\"こ\":1},\"雨\":{\"太\":1,\"き\":1,\"开\":2,\":\":2,\"或\":2,\"天\":2},\"郎\":{\"、\":1},\"、\":{\"誠\":1,\"常\":1,\"美\":1,\"正\":58,\"こ\":58,\"前\":58,\"ど\":58,\"一\":58,\"無\":1,\"東\":1,\"再\":1,\"も\":1,\"そ\":1,\"笑\":1,\"学\":1,\"通\":1,\"四\":2,\"三\":1,\"井\":1},\"誠\":{\"心\":1,\"意\":1},\"心\":{\"誠\":1},\"意\":{\"を\":1,\"味\":58,\"」\":1,\"見\":1},\"持\":{\"っ\":1,\"ち\":58,\"者\":1,\"つ\":1},\"姉\":{\"御\":1},\"御\":{\"の\":1},\"足\":{\"の\":1},\"指\":{\"の\":1,\"定\":1},\"節\":{\"を\":1},\"崇\":{\"め\":1,\"徳\":2},\"奉\":{\"り\":1},\"@AFmbsk:\":{\"@samao21718\":1},\"@samao21718\":{\"\\n\":1},\"呼\":{\"び\":3,\"ば\":3},\"び\":{\"方\":3},\"方\":{\"☞\":1,\"☞あー\":1,\":うえ\":1,\":\":3,\"は\":1,\"か\":1},\"☞\":{\"ま\":1,\"平\":1,\"も\":1,\"楽\":1,\"全\":1},\"ち\":{\"ゃ\":7,\"ば\":58,\"ょ\":1,\"ら。\":1,\"に\":1},\"ゃ\":{\"ん\":6,\"んを\":1,\"な\":1},\"ば\":{\"れ\":3,\"か\":58,\"いいん\":1},\"☞あー\":{\"ち\":1},\"平\":{\"野\":1,\"\":1,\"均\":1},\"野\":{\"か\":1,\"滉\":1},\"ら？！\":{\"\\n\":1},\"☞お\":{\"と\":1},\"ぽ\":{\"い！！\":1},\"い！！\":{\"\\nLINE\":1},\"るん\\\\(\":{\"ˆoˆ\":1},\"ˆoˆ\":{\")/\":1},\")/\":{\"\\nトプ\":1},\"楽\":{\"し\":2},\"いー\":{\"な\":1},\"😳\":{\"\\n\":1},\"族\":{\"に\":2},\"ら☞お\":{\"ね\":1},\"ね\":{\"ぇ\":1,\"(´･_･`)♡\":1,\"！」\":1,\"！\":1,\"！ティアラ\":1,\"♡\":1},\"ぇ\":{\"ち\":1},\"最\":{\"後\":3},\"後\":{\"に\":3},\"全\":{\"然\":1,\"車\":1,\"国\":1},\"然\":{\"会\":1},\"会\":{\"え\":2,\"場\":1,\"長\":1},\"い…\":{},\"常\":{\"に\":1},\"身\":{\"一\":1},\"簡\":{\"素\":1},\"素\":{\"に\":1},\"美\":{\"食\":1},\"食\":{\"を\":1,\"え\":1},\"@shiawaseomamori:\":{\"一\":58},\"書\":{\"い\":58,\"提\":1},\"正\":{\"し\":116,\"式\":1},\"いう\":{\"意\":58,\"気\":58,\"の\":58},\"味\":{\"だ\":58,\"方\":1},\"年\":{\"に\":58,\"08\":1,\"運\":1},\"知\":{\"り\":58,\"事\":2},\"。\":{\"人\":58,\"魔\":1,\"\\nRT\":1,\"明\":2,\"预\":2,\"\\n\":1},\"人\":{\"は\":59,\"男\":1,\"に\":3,\"質\":1,\"格\":1,\"。\":1},\"いる\":{\"と\":58,\"量\":1,\"私\":1},\"へ\":{\"前\":58,\"と\":58,\"移\":1},\"急\":{\"い\":58},\"ど\":{\"ん\":117,\"う\":2,\"ね\":1},\"大\":{\"切\":58,\"盛\":1,\"学\":1,\"阪\":2,\"拡\":1,\"暴\":2,\"変\":1,\"事\":1},\"切\":{\"な\":58},\"置\":{\"き\":58},\"去\":{\"り\":58},\"ょ\":{\"う。\":58,\"っ\":1},\"う。\":{\"本\":58},\"当\":{\"に\":58,\"た\":1},\"番\":{\"初\":58},\"初\":{\"め\":58},\"場\":{\"所\":58,\"入\":1,\"おい\":1,\"一\":1},\"所\":{\"に\":58,\"有\":1,\"持\":1},\"ある\":{\"の\":58},\"…\":{\"僕\":1},\"@POTENZA_SUPERGT:\":{\"あり\":1},\"あり\":{\"が\":1},\"！“@8CBR8:\":{\"@POTENZA_SUPERGT\":1},\"@POTENZA_SUPERGT\":{\"13\":1},\"時\":{\"30\":1,\"半\":1,\"計\":1,\"～\":1},\"半\":{\"ご\":1},\"無\":{\"事\":1},\"事\":{\"全\":1,\"は\":1,\"に\":1,\"！\":1,\"し\":1},\"車\":{\"決\":1},\"決\":{\"勝\":2,\"定\":1},\"勝\":{\"レース\":1,\"戦\":1},\"レース\":{\"完\":1},\"完\":{\"走\":1},\"走\":{\"出\":1},\"祈\":{\"っ\":1},\"http://t.co/FzTyFnt9xH”\":{},\"@UARROW_Y:\":{\"よう\":2},\"体\":{\"操\":3},\"操\":{\"第\":3},\"踊\":{\"る\":2,\"っ\":1},\"国\":{\"見\":2,\"の\":1},\"英\":{\"http://t.co/SXoYWH98as\":2},\"http://t.co/SXoYWH98as\":{},\"日\":{\"は\":1,\"20:47:53\":1,\"多\":2,\"电\":2,\")\":2,\"，\":2,\"子\":2,\"ま\":1,\"一\":1,\"南\":1},\"高\":{\"と\":1,\"校\":2},\"三\":{\"桜\":1,\"軍\":1,\"浦\":2,\"重\":1},\"桜\":{\"（・θ・）\":1},\"（・θ・）\":{\"\\n\":1},\"光\":{\"梨\":1,\")-「ソードマスター」\":1,\"筆\":1},\"梨\":{\"ち\":1},\"〜\":{},\"@assam_house:\":{\"泉\":1},\"泉\":{\"田\":1},\"新\":{\"潟\":1,\"网\":2,\"品\":1},\"潟\":{\"県\":1},\"県\":{\"知\":1},\"東\":{\"電\":1,\"宝\":1},\"電\":{\"の\":1},\"申\":{\"請\":1},\"請\":{\"書\":1},\"提\":{\"出\":1},\"容\":{\"認\":1},\"認\":{\"さ\":1,\"め\":1},\"さ\":{\"せ\":1,\"い。\":1,\"に\":1,\"、\":1,\"れ\":2,\"い！\":1,\"と\":1,\"ん\":2,\"れる\":1,\"れる）」\":1},\"られ\":{\"た\":2,\"し\":1},\"再\":{\"稼\":2},\"稼\":{\"働\":2},\"働\":{\"に\":1,\"を\":1},\"必\":{\"要\":1,\"死\":1},\"要\":{\"な\":1},\"「\":{\"同\":1,\"成\":1,\"く\":1,\"剣\":1,\"不\":1},\"」\":{\"は\":1,\"の\":1},\"与\":{\"え\":1},\"ん。\":{\"今\":1},\"柏\":{\"崎\":1},\"崎\":{\"刈\":1,\"貴\":1},\"刈\":{\"羽\":1},\"羽\":{\"の\":1},\"抑\":{\"え\":1},\"踏\":{\"ん\":1},\"張\":{\"りをお\":1},\"りをお\":{\"願\":1},\"願\":{\"い\":2},\"送\":{\"っ\":1,\"局\":2},\"下\":{\"さ\":2,\"一\":1},\"い。\":{\"全\":1},\"皆\":{\"様\":1},\"様\":{\"、お\":1},\"、お\":{\"願\":1},\"\\nhttp://t.co…\":{},\"@Takashi_Shiina:\":{\"テレビ\":1},\"テレビ\":{\"で\":1},\"成\":{\"人\":1},\"男\":{\"性\":1},\"性\":{\"の\":1},\"カロリー\":{\"摂\":1},\"摂\":{\"取\":1},\"取\":{\"量\":1,\"られ\":1,\"り\":1},\"量\":{\"は\":1,\"で\":1},\"1900kcal」\":{\"と\":1},\"私\":{\"が\":1,\"道\":1},\"ダイエット\":{\"の\":1},\"死\":{\"で\":1},\"キープ\":{\"し\":1},\"、「\":{\"そ\":1},\"普\":{\"通\":2},\"通\":{\"な\":1,\"っ\":1,\"の\":1,\"行\":1},\"天\":{\"9\":2,\"一\":1,\"(31\":2,\"气\":2,\"，\":2,\"下\":1,\"冥\":2},\"や\":{\"ココイチ\":1,\"る\":3,\"っ\":1,\"るww\":1,\"赤\":1,\"ま\":1,\"け\":1},\"ココイチ\":{\"に\":1},\"盛\":{\"りを\":1,\"り\":1},\"りを\":{\"食\":1},\"いいん\":{\"だ\":1},\"！」\":{\"と\":1,\"\\n\":1},\"@kohecyan3\":{\"\\n\":1},\"上\":{\"野\":1,\"真\":1,\"一\":1},\"滉\":{\"平\":1},\":うえ\":{\"の\":1},\"過\":{\"剰\":1},\"剰\":{\"な\":1},\"俺\":{\"イケメン\":1,\"の\":1},\"イケメン\":{\"で\":1},\"アピール\":{\"\\n\":1},\":バーバリー\":{\"の\":1},\"計\":{\"\":1},\"ろ:あ\":{\"の\":1},\"自\":{\"信\":1},\"信\":{\"さ\":1},\"笑\":{\"い\":1,\"ｗｗ\":1},\"絶\":{\"え\":1},\"学\":{\"受\":1,\"校\":1,\"日\":2,\"生\":2,\"的\":2},\"受\":{\"か\":1,\"け\":1,\"診\":1},\"？\":{\"応\":1},\"応\":{\"援\":1},\"援\":{\"し\":1},\"る〜(*^^*)！\":{\"\\n\\n#RT\":1},\"\\n\\n#RT\":{\"し\":1},\"軍\":{\"か\":1,\"兵\":1},\"ら２\":{\"個\":1},\"個\":{\"師\":1},\"師\":{\"団\":2,\"匠\":1},\"団\":{\"が\":1,\"長\":1},\"北\":{\"へ\":1,\"部\":2},\"移\":{\"動\":1},\"動\":{\"中\":1,\"画\":1,\"員\":1},\"中\":{\"ら\":1,\"京\":2,\"継\":2,\"新\":2,\"央\":2,\"小\":2,\"部\":2,\"古\":1,\"國\":1},\"い　　　　　\":{\"こ\":1},\"調\":{\"子\":1},\"満\":{\"州\":1,\"喫\":1},\"州\":{\"に\":1},\"陸\":{\"軍\":1},\"兵\":{\"力\":1},\"力\":{\"が\":1},\"ふ\":{\"れ\":1,\"ぁ\":1},\"える\":{},\"@naopisu_:\":{\"呼\":1},\"ら:\":{\"\\n\":1},\"\\n#RT\":{\"し\":1},\"\\n\\nお\":{\"腹\":1},\"腹\":{\"痛\":1},\"痛\":{\"く\":1},\"寝\":{\"れ\":1},\"るww\":{\"\\n\":1},\"ぞ\":{\"〜😏🙌\":1},\"〜😏🙌\":{},\"レッドクリフ\":{\"の\":1},\"キャラ\":{\"の\":1},\"女\":{\"装\":1},\"装\":{\"っ\":1},\"わろ\":{\"た\":1},\"www\":{\"朝\":1},\"面\":{\"白\":2,\"子\":1},\"白\":{\"か\":1,\"い\":1},\"(\":{\"˘ω゜)\":1,\"三\":1},\"˘ω゜)\":{\"笑\":1},\"状\":{\"態\":1},\"態\":{\"良\":1},\"良\":{\"好\":1},\"】ペンタックス・デジタル\":{\"一\":1},\"眼\":{\"レフカメラ・K20D\":1,\"レフ\":1},\"レフカメラ・K20D\":{\"入\":1},\"入\":{\"札\":1,\"り\":1},\"札\":{\"数\":1},\"数\":{\"=38\":1},\"=38\":{\"現\":1},\"現\":{\"在\":2,\"場\":1},\"在\":{\"価\":1,\"の\":1,\"前\":1},\"価\":{\"格\":1},\"格\":{\"=15000\":1,\"的\":1},\"=15000\":{\"円\":1},\"円\":{\"http://t.co/4WK1f6V2n6\":1},\"http://t.co/4WK1f6V2n6\":{\"終\":1},\"終\":{\"了\":1},\"了\":{\"=2014\":1,\"！\":1},\"=2014\":{\"年\":1},\"08\":{\"月\":1},\"月\":{\"1\":2,\"31\":3,\"と\":1,\"恐\":1},\"20:47:53\":{\"#\":1},\"#\":{\"一\":1,\"天\":1},\"レフ\":{\"http://t.co/PcSaXzfHMW\":1},\"http://t.co/PcSaXzfHMW\":{},\"夢\":{\"見\":1},\"魔\":{\"法\":1},\"法\":{\"科\":1,\"に\":1},\"科\":{\"高\":1,\"二\":1,\"の\":1},\"校\":{\"通\":1,\"対\":1,\"の\":1,\"竹\":1},\"（\":{\"別\":1,\"中\":1,\"永\":1},\"別\":{\"に\":1,\"な\":1},\"二\":{\"科\":1,\"号\":1},\"い）クラスメイト\":{\"に\":1},\"ヨセアツメ\":{\"面\":1},\"赤\":{\"僕\":2},\"僕\":{\"の\":2,\"読\":1,\"が\":1},\"拓\":{\"也\":2},\"也\":{\"が\":2},\"対\":{\"抗\":1,\"崇\":1,\"中\":1,\"し\":1},\"抗\":{\"合\":1},\"唱\":{\"コンクール\":1},\"コンクール\":{\"が\":1},\"開\":{\"催\":1},\"催\":{\"さ\":1},\"際\":{\"他\":1,\"は\":1},\"他\":{\"校\":1},\"妨\":{\"害\":3},\"害\":{\"工\":1,\"行\":1,\"と\":1},\"工\":{\"作\":1},\"作\":{\"受\":1},\"り、\":{\"拓\":1},\"実\":{\"が\":1},\"質\":{\"に\":1},\"読\":{\"み\":1},\"@oen_yakyu:\":{\"●\":1},\"●\":{\"継\":1},\"継\":{\"続\":1,\"〉\":2},\"試\":{\"合\":1},\"京\":{\"対\":1,\"or\":1,\"青\":1},\"徳\":{\"）46\":1,\")　12\":1},\"）46\":{\"回\":1},\"回\":{\"～　9\":1,\"そ\":1},\"～　9\":{\"時\":1},\"～\":{\"\\n　〈ラジオ\":2,\"　http://t.co/lmlgp38fgZ\":1},\"\\n　〈ラジオ\":{\"中\":2},\"〉\":{\"\\n　ら\":2},\"\\n　ら\":{\"じ\":2},\"じ\":{\"る★ら\":2,\"る→\":2,\"る\":1,\"ゃ\":1},\"る★ら\":{\"じ\":2},\"る→\":{\"大\":2},\"阪\":{\"放\":2},\"放\":{\"送\":2},\"局\":{\"を\":2},\"択\":{\"→NHK-FM\":1,\"→NHK\":1},\"→NHK-FM\":{\"\\n●\":1},\"\\n●\":{\"決\":1},\"戦\":{\"(\":1,\"ウィンドウズ9\":1},\"浦\":{\"対\":1,\"春\":1},\"or\":{\"崇\":1},\")　12\":{\"時\":1},\"→NHK\":{\"第\":1},\"\\n　※\":{\"神\":1},\"神\":{\"奈\":1},\"奈\":{\"川\":1},\"ラ…\":{},\"@Ang_Angel73:\":{\"逢\":1},\"逢\":{\"坂\":1},\"坂\":{\"「\":1},\"秘\":{\"め\":1},\"右\":{\"目\":1},\"…！」\":{\"\\n\":1},\"「……………。」\":{},\"【H15-9-4】\":{\"道\":1},\"路\":{\"を\":1,\"一\":1},\"利\":{\"用\":1,\"益\":2,\"を\":1},\"用\":{\"す\":1,\"激\":1},\"益\":{\"は\":1,\"で\":1},\"反\":{\"射\":1,\"転\":1},\"射\":{\"的\":1,\"向\":1},\"的\":{\"利\":1,\"権\":1,\"日\":2,\"臉\":2},\"あり、\":{\"建\":1},\"建\":{\"築\":1},\"築\":{\"基\":1},\"基\":{\"準\":1,\"づ\":1},\"準\":{\"法\":1},\"づ\":{\"い\":1},\"定\":{\"が\":1,\"戦\":1},\"敷\":{\"地\":1},\"有\":{\"者\":1,\"强\":2,\"雨\":2},\"者\":{\"に\":1,\"\":1},\"為\":{\"の\":1},\"排\":{\"除\":1},\"除\":{\"を\":1},\"求\":{\"め\":1},\"い。→\":{\"誤\":1},\"誤\":{\"。\":1},\"@takuramix:\":{\"福\":1},\"福\":{\"島\":2},\"島\":{\"第\":2},\"原\":{\"発\":2},\"発\":{\"の\":1,\"　４\":1,\"動\":1},\"構\":{\"内\":1},\"内\":{\"地\":1,\"蒙\":2,\"由\":1},\"図\":{\"が\":1},\"ら。\":{\"\\nhttp://t.co/ZkU4TZCGPG\":1},\"\\nhttp://t.co/ZkU4TZCGPG\":{\"\\n\":1},\"、１\":{\"号\":1},\"号\":{\"機\":2,\"を\":1,\"「リン\":2},\"機\":{\"。\":1,\"　\":1},\"\\nRT\":{\"@Lightworker19:\":1},\"@Lightworker19:\":{\"【\":1},\"拡\":{\"散\":1},\"散\":{\"】　\":1},\"】　\":{\"福\":1},\"　４\":{\"号\":1},\"　\":{\"爆\":1,\"山\":1,\"踊\":1},\"爆\":{\"発\":1,\"笑\":1},\"　40\":{\"秒\":1},\"秒\":{\"～\":1},\"　http://t.co/lmlgp38fgZ\":{},\"四\":{\"川\":4},\"盆\":{\"地\":4},\"江\":{\"淮\":4},\"淮\":{\"等\":2,\"东\":2},\"等\":{\"地\":4},\"将\":{\"有\":4,\"迎\":2},\"强\":{\"降\":2},\"降\":{\"雨\":2},\"开\":{\"学\":4},\"多\":{\"地\":2},\"　　\":{\"中\":2},\"网\":{\"8\":2},\"电\":{\"据\":2},\"据\":{\"中\":2},\"央\":{\"气\":2,\"東\":1},\"气\":{\"象\":2,\"。\":2},\"消\":{\"息\":2,\"さ\":1},\"息\":{\"，\":2},\"，\":{\"江\":2,\"是\":2,\"内\":2,\"觀\":1,\"竟\":1},\"东\":{\"部\":2,\"北\":2},\"部\":{\"、\":2,\"等\":2,\"、...\":2,\"「\":1},\"(31\":{\"日\":2},\")\":{\"又\":2},\"又\":{\"将\":2},\"迎\":{\"来\":2},\"场\":{\"暴\":2},\"暴\":{\"雨\":4},\"或\":{\"大\":2},\"明\":{\"天\":4,\"日\":1},\"是\":{\"中\":2,\"非\":1},\"预\":{\"计\":2},\"计\":{\"明\":2},\"蒙\":{\"古\":2},\"古\":{\"中\":2,\"品\":1},\"、...\":{\"http://t.co/toQgVlXPyH\":1,\"http://t.co/RNdqIHmTby\":1},\"http://t.co/toQgVlXPyH\":{},\"@Take3carnifex\":{\"そ\":1},\"命\":{\"に\":1},\"わり\":{\"ま\":1},\"非\":{\"う\":1},\"診\":{\"し\":1},\"い！\":{},\"ｗｗ\":{\"珍\":1},\"珍\":{\"解\":1},\"解\":{\"答\":1},\"答\":{\"集\":1,\"だ\":1},\"集\":{\"！\":1},\"先\":{\"生\":1},\"ツメ\":{\"の\":1},\"甘\":{\"さ\":1},\"徒\":{\"の\":1,\"会\":1},\"センスを\":{\"感\":1},\"感\":{\"じ\":1},\"問\":{\"一\":1},\"FB\":{\"で\":1},\"話\":{\"題\":1},\"題\":{\"！！\":1},\"！！\":{\"\\nう\":1},\"\\nう\":{\"ど\":1},\"ウィンドウズ9\":{\"三\":1},\"重\":{\"高\":1},\"竹\":{\"内\":1},\"由\":{\"恵\":1},\"恵\":{\"アナ\":1},\"アナ\":{\"花\":1},\"花\":{\"火\":1},\"火\":{\"保\":1},\"保\":{\"険\":1},\"険\":{\"\":1},\"\\nhttp://t.co/jRWJt8IrSB\":{\"http://t.co/okrAoxSbt0\":1},\"http://t.co/okrAoxSbt0\":{},\"@nasan_arai\":{\"\\n\":1},\"ー\":{\"さ\":2},\"誰\":{\"。(´･_･`)\":1},\"。(´･_･`)\":{\"\\n\":1},\"→れいら♡\":{\"\\nLINE\":1},\"る？→\":{\"し\":1},\"る(｢･ω･)｢\":{\"\\n\":1},\"ろ→\":{\"可\":1},\"可\":{\"愛\":1},\"愛\":{\"い\":1,\"し\":1},\"優\":{\"し\":3},\"〜(´･_･`)♡GEM\":{\"現\":1},\"おい\":{\"で\":1},\"(´･_･`)♡\":{\"\\n\\n#\":1},\"\\n\\n#\":{\"ふ\":1},\"ぁ\":{\"ぼ\":1},\"ぼ\":{\"し\":1},\"\\\"ソードマスター\\\"\":{\"剣\":1},\"剣\":{\"聖\":2,\"士\":1,\"の\":1},\"聖\":{\"カミイズミ\":1,\"」\":1},\"カミイズミ\":{\"(CV:\":1},\"(CV:\":{\"緑\":1},\"緑\":{\"川\":1},\")-「ソードマスター」\":{\"の\":1},\"アスタリスク\":{\"所\":1},\"長\":{\"に\":1,\"と\":1},\"称\":{\"号\":1},\"士\":{\"。イデア\":1},\"。イデア\":{\"の\":1},\"匠\":{\"。\":1},\"敵\":{\"味\":1},\"尊\":{\"敬\":1},\"敬\":{\"さ\":1},\"れる\":{\"一\":1},\"流\":{\"の\":1},\"武\":{\"人\":1},\"闇\":{\"「リン\":1,\"「（\":1},\"「リン\":{\"と\":1,\"ち\":2},\"付\":{\"き\":1},\"歳\":{\"の\":1},\"差\":{\"以\":1},\"以\":{\"外\":1},\"外\":{\"に\":1},\"いろいろ\":{\"壁\":1},\"壁\":{\"が\":1},\"よ。\":{\"愛\":1},\"隊\":{\"の\":1},\"風\":{\"紀\":1},\"紀\":{\"厨\":1},\"厨\":{\"の\":1},\"…」\":{\"\\n\":3},\"んを\":{\"泣\":1},\"泣\":{\"か\":1},\"らシメる\":{\"か\":1},\"ら×\":{\"す\":1},\"執\":{\"行\":1},\"不\":{\"純\":1},\"純\":{\"な\":1},\"締\":{\"ま\":1},\"ろう\":{\"じ\":1},\"「（\":{\"消\":1},\"れる）」\":{},\"\\\"@BelloTexto:\":{\"¿Quieres\":1},\"¿Quieres\":{\"ser\":1},\"ser\":{\"feliz?\":1},\"feliz?\":{\"\\n\":1},\"\\\"No\":{\"stalkees\\\"\":5,\"stalkees\\\".\\\"\":1},\"stalkees\\\"\":{\"\\n\":5},\"stalkees\\\".\\\"\":{},\"@kaoritoxx\":{\"そ\":1},\"うよ！あ\":{\"た\":1},\"うよう\":{\"に\":1},\"おる。い\":{\"ま\":1},\"職\":{\"場\":1},\"る(°_°)！\":{\"満\":1},\"喫\":{\"幸\":1},\"幸\":{\"せ\":1},\"焼\":{\"け\":1},\"！！wあー、\":{\"な\":1},\"ほ\":{\"ど\":1},\"毎\":{\"回\":1},\"よ\":{\"ね\":1},\"！ティアラ\":{\"ち\":1},\"♡\":{\"五\":1},\"五\":{\"月\":1},\"九\":{\"月\":1},\"恐\":{\"ろ\":1},\"い、、、\":{\"\\nハリポタエリア\":1},\"\\nハリポタエリア\":{\"は\":1},\"？？\":{},\"@itsukibot_\":{\"一\":1},\"稀\":{\"の\":1},\"ソーセージをペロペロ\":{\"す\":1},\"音\":{\"は\":1},\"デカイ\":{},\"冥\":{\"の\":2},\"標\":{\"VI\":2},\"VI\":{\"宿\":2},\"宿\":{\"怨\":2},\"怨\":{\"PART1\":2},\"PART1\":{\"/\":1},\"/\":{\"小\":1},\"水\":{\"\":1},\"\\nhttp://t.co/fXIgRt4ffH\":{\"\\n\":1},\"\\n#キンドル\":{\"#\":1},\"http://t.co/RNdqIHmTby\":{},\"@vesperia1985\":{\"お\":1},\"よー！\":{\"\\n\":1},\"よ…！！\":{\"明\":1},\"いい\":{},\"映\":{\"画\":1},\"パンフレット】　\":{\"永\":1},\"永\":{\"遠\":2},\"遠\":{\"の\":2},\"０\":{\"（\":1},\"ゼロ）　\":{\"監\":1},\"監\":{\"督\":1},\"督\":{\"　\":1},\"貴\":{\"　キャスト　\":1},\"　キャスト　\":{\"岡\":1},\"岡\":{\"田\":1},\"准\":{\"一\":1},\"春\":{\"馬\":1},\"馬\":{\"、\":1},\"井\":{\"上\":1},\"真\":{\"央\":1},\"宝\":{\"(2)11\":1},\"(2)11\":{\"点\":1},\"点\":{\"の\":1},\"品\":{\"／\":1,\"を\":1,\"の\":1},\"／\":{\"中\":1},\"る:\":{\"￥\":1},\"￥\":{\"500より\":1},\"500より\":{\"\\n(\":1},\"\\n(\":{\"こ\":1},\"商\":{\"品\":1},\"ランク\":{\"に\":1},\"式\":{\"な\":1,\"，\":1},\"情\":{\"報\":1},\"報\":{\"に\":1},\"、アートフレーム...\":{\"http://t.co/4hbyB1rbQ7\":1},\"http://t.co/4hbyB1rbQ7\":{},\"@siranuga_hotoke:\":{\"ゴキブリ\":1},\"ゴキブリ\":{\"は\":1},\"世\":{\"帯\":1},\"帯\":{\"に\":1},\"均\":{\"し\":1},\"匹\":{\"いる。\":1},\"いる。\":{},\"@fightcensorship:\":{\"李\":1},\"李\":{\"克\":2},\"克\":{\"強\":2},\"強\":{\"總\":1,\"的\":1},\"總\":{\"理\":2},\"理\":{\"的\":1,\"李\":1},\"臉\":{\"綠\":1,\"。http://t.co/HLX9mHcQwe\":1},\"綠\":{\"了\":1},\"南\":{\"京\":1},\"青\":{\"奧\":1},\"奧\":{\"會\":1},\"會\":{\"閉\":1},\"閉\":{\"幕\":1},\"幕\":{\"式\":1},\"觀\":{\"眾\":1},\"眾\":{\"席\":1},\"席\":{\"上\":1},\"貪\":{\"玩\":1},\"玩\":{\"韓\":1},\"韓\":{\"國\":1},\"國\":{\"少\":1,\"總\":1},\"少\":{\"年\":1},\"運\":{\"動\":1},\"員\":{\"，\":1},\"竟\":{\"斗\":1},\"斗\":{\"膽\":1},\"膽\":{\"用\":1},\"激\":{\"光\":1},\"筆\":{\"射\":1},\"向\":{\"中\":1},\"。http://t.co/HLX9mHcQwe\":{\"http://t.co/fVVOSML5s8\":1},\"http://t.co/fVVOSML5s8\":{},\"【マイリスト】【\":{\"彩\":1},\"彩\":{\"りりあ】\":1},\"りりあ】\":{\"妖\":1},\"妖\":{\"怪\":1},\"怪\":{\"体\":1},\"転\":{\"】\":1},\"http://t.co/PjL9if8OZC\":{\"#sm24357625\":1},\"#sm24357625\":{}}",
    ) as Record<string, Record<string, number>>;
}

export function getTwitterJsonUserDescFieldMarkovChain() {
    return JSON.parse(
        "{\"1\":{\"と\":1},\"2\":{\"人\":1},\"18\":{\"歳\":1},\"24\":{\"/\":1},\"MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#\":{\"24\":1,\"無\":1,\"プリキュア\":1,\"RT\":1,\"ぱ\":1,\"猫\":1,\"湯\":1,\"川\":1,\"bot\":1,\"アイコン\":1,\"ﾟ.＊97line\":1,\"2310*basketball#41*UVERworld*Pooh☪Bell\":1,\"宮\":1,\"や\":3,\"自\":61,\"人\":1,\"F1.GP2.Superformula.SuperGT.F3...\":1,\"ブリヂストン\":1,\"思\":3,\"銀\":1,\"HQ!!\":2,\"さ\":1,\"み\":3,\"動\":1,\"アッサム\":1,\"ラブラブ\":1,\"と\":1,\"ど\":1,\"ふ\":1,\"ディズニー\":1,\"深\":1,\"な\":3,\"ROM\":1,\"漫\":1,\"普\":2,\"す\":1,\"イザ\":1,\"#\":1,\"解\":1,\"Gパング\":1,\"女\":2,\"腐\":1,\"こ\":2,\"ジャニーズ\":1,\"＼\":1,\"ウザ\":1,\"THE\":1,\"Yahooオークション\":1,\"世\":1,\"成\":1,\"ヤー・チャイカ。\":1,\"兵\":1,\"知\":3,\"デイジー\":1,\"私\":2,\"大\":1,\"ほ\":1,\"行\":1,\"い\":1,\"【\":1,\"hack\":1,\"話\":1,\"⁽⁽٩(\":1,\"ProjectDIVA\":1,\"美\":1,\"日\":1,\"スニーカー\":1,\"cambiando\":1,\"異\":1,\"「おお～\":2,\"男\":1,\"オシャレ\":1,\"意\":1,\"見\":1,\"ONE\":1,\"豊\":1,\"誰\":1,\"素\":1,\"か\":1,\"も\":1,\"楽\":1,\"た\":1,\"中\":1,\"LDHファン\":1,\"あ\":1,\"サマーエルフ\":1,\"家\":1,\"君\":1,\"き\":1,\"经\":1,\"被\":1,\"ニコ\":1},\"元\":{\"野\":1,\"勃\":1,\"々\":1},\"野\":{\"球\":3,\"郎\":1,\"悠\":1,\"）をランダム\":1},\"球\":{\"部\":2,\"選\":1},\"部\":{\"マネージャー❤︎…\":1,\"分\":1,\"受\":1,\"京\":1,\"を\":1,\"変\":1,\"屋\":1},\"マネージャー❤︎…\":{\"最\":1},\"最\":{\"高\":1,\"近\":2,\"愛\":1,\"後\":1},\"高\":{\"の\":1,\"校\":2,\"生\":5,\"河\":1},\"の\":{\"2\":1,\"夏\":1,\"サラリーマン\":1,\"キャラクター\":1,\"壱\":1,\"目\":2,\"手\":1,\"街\":1,\"元\":1,\"犬\":1,\"わ\":1,\"で\":10,\"り\":1,\"画\":2,\"つ\":1,\"な\":1,\"川\":1,\"た\":2,\"あるあるアカウント\":1,\"趣\":2,\"自\":2,\"格\":1,\"心\":1,\"重\":1,\"スポーツタイヤ「POTENZA」\":1,\"アカウント\":3,\"事\":2,\"称\":1,\"本\":3,\"気\":1,\"際\":2,\"は\":1,\"間\":1,\"も\":1,\"プロフ\":1,\"動\":1,\"写\":1,\"か\":6,\"人\":5,\"オンパレード\":1,\"秘\":1,\"A\":1,\"非\":1,\"台\":1,\"カッコイイ\":1,\"や\":2,\"有\":1,\"デジカメカテゴリ\":1,\"中\":2,\"末\":1,\"予\":1,\"甲\":1,\"スマホ\":1,\"想\":1,\"ま\":1,\"建\":2,\"～？\":1,\"リアリティを\":1,\"過\":1,\"都\":2,\"領\":1,\"発\":2,\"裏\":1,\"東\":1,\"フォローお\":1,\"機\":1,\"方\":1,\"夢\":1,\"ディープ\":1,\"に\":3,\"男\":1,\"６\":1,\"オンパレード！\":1,\"。\":1,\"こ\":1,\"モジュール・ストレンジダーク×\":1,\"オモシロ\":1,\"「\":1,\"知\":2,\"あるある☆\":1,\"生\":2,\"注\":1,\"習\":1,\"ヒント\":1,\"名\":1,\"ストーリーを、\":1,\"アイテムを\":1,\"が\":1,\"雑\":1,\"日\":1,\"住\":1,\"し\":1,\"ど\":1,\"う\":1,\"道\":2,\"対\":1,\"瞳\":1,\"転\":1},\"夏\":{\"をあり\":1},\"をあり\":{\"が\":1},\"が\":{\"と\":3,\"好\":6,\"よろ\":2,\"良\":1,\"主\":1,\"せ\":1,\"Ｆ／Ｂ\":1,\"幸\":59,\"ある。\":1,\"大\":2,\"で\":1,\"ら\":1,\"アッサム\":1,\"アップ\":1,\"込\":1,\"BLNL\":1,\"知\":1,\"中\":1,\"あり\":1,\"あるん\":1,\"スマホ\":1,\"見\":1,\"聞\":1,\"可\":1,\"欲\":1,\"っ\":1,\"ある\":2,\"。\":1,\"ビシバシ\":1,\"趣\":1,\"、\":1,\"仏\":1},\"と\":{\"う…❤︎\":1,\"動\":1,\"ブレイブルー、\":1,\"も\":3,\"暮\":1,\"し\":6,\"思\":83,\"か\":3,\"実\":1,\"周\":58,\"が\":1,\"、\":2,\"に\":3,\"変\":1,\"いう\":1,\"楽\":1,\"八\":1,\"こ\":1,\"ん\":1,\"り\":1,\"全\":1,\"うれ\":1,\"本\":1,\"見\":1,\"いうバンド\":1,\"ポケモン\":1,\"う…。@ringo_BDFFLOVE\":1,\"呟\":1,\"使\":1,\"で\":2,\"言\":1,\"、あ\":1,\"理\":1,\"驚\":1,\"一\":1,\"早\":1,\"く\":1,\"上\":1,\"な\":1,\"つ\":1,\"う\":1,\"弱\":1},\"う…❤︎\":{},\"無\":{\"言\":2,\"断\":1,\"条\":1},\"言\":{\"フォロー\":2,\"っ\":4,\"葉\":59,\"は\":1,\"え\":2,\"い\":1,\"や\":1,\"われるよう\":1,\"论\":2},\"フォロー\":{\"は\":1,\"で\":87,\"し\":2,\"も\":3,\"多\":1,\"非\":1},\"は\":{\"あ\":1,\"MGS\":1,\"ハートキャッチ、\":1,\"月\":1,\"こ\":1,\"な\":1,\"お\":1,\"ブロック！[HOT]K[アニメ]タイバニ/Ｋ/\":1,\"兄\":1,\"RT\":9,\"、\":10,\"譲\":1,\"言\":2,\"い\":1,\"プロフ\":3,\"皆\":1,\"@assam_yamanaka\":1,\"早\":1,\"思\":1,\"手\":1,\"、BL～\":1,\"、わ\":1,\"や\":1,\"若\":1,\"想\":1,\"「\":1,\"ツイプロ。アイコン\":1,\"ま\":1,\"随\":1,\"一\":1,\"何\":1,\"良\":1,\"私\":1,\"、ツイプロ\":1,\"・・・●●」　いい\":1,\"の\":1,\"無\":1,\"元\":1,\"対\":1,\")”○”　DM\":1,\"絶\":1},\"あ\":{\"ま\":1,\"げ\":1,\"の\":1,\"き\":1,\"な\":1},\"ま\":{\"り\":1,\"せ\":3,\"す\":254,\"ら\":2,\"う\":3,\"れ\":1,\"う♪\":1,\"し\":4,\"で\":3,\"うLINE\":1,\"だ\":2,\"に\":2,\"め\":1,\"う、\":2,\"た\":1},\"り\":{\"好\":1,\"さ\":1,\"も\":59,\"に\":2,\"た\":2,\"別\":1,\"集\":1,\"嵐\":1,\"多\":1,\"と\":1,\"や\":1,\"ま\":1,\"つ\":1,\"そ\":1,\"今\":1,\"す\":1,\"付\":2,\"手\":1,\"だ\":1},\"好\":{\"み\":1,\"き\":24},\"み\":{\"ま\":4,\"し\":1,\"つ\":1,\"な\":22,\"を\":1,\"ん\":4,\"た\":4,\"よう☆\":1,\"て\":1},\"せ\":{\"ん\":2,\"は\":1,\"て\":1,\"し\":1,\"だ\":58,\"に\":59,\"られ\":1,\"ん…。ツイート\":1,\"ろり\":1,\"な\":1},\"ん\":{\"ゲーム\":1,\"で\":7,\"す\":1,\"ち\":1,\"勤\":1,\"上\":1,\"か\":3,\"な\":76,\"気\":1,\"だ\":5,\"ど\":2,\"使\":1,\"探\":1,\"い\":1,\"友\":1,\"と\":4,\"に\":1,\"が\":1},\"ゲーム\":{\"と\":1},\"動\":{\"画\":3,\"か\":1,\"物\":3,\"で\":2,\"を\":1,\"エピソードをお\":1,\"中\":1,\"の\":1},\"画\":{\"が\":1,\"像\":7,\"]\":1,\"」を\":1,\"家\":1,\"！\":1,\"の\":1},\"き\":{\"で\":3,\"の\":1,\"な\":10,\"。\":2,\"る！\":58,\"る\":59,\"♡\":2,\"！\":3,\"ま\":16,\"た\":1,\"ｗ\":1,\"！（≧∇≦）\":1,\"っ\":1,\"ら\":1,\"を\":1,\"て\":1,\"。ゾロビン、ローロビ、ルロビ♡usj、\":1,\"♩\":1,\"だ\":1,\"も\":1,\"に\":1,\"！【お\":1},\"で\":{\"す\":48,\"緑\":1,\"相\":1,\"る\":1,\"み\":22,\"き\":60,\"、お\":62,\"サポート\":1,\"、\":7,\"も\":7,\"ある\":1,\"ご\":3,\"～\":1,\"欲\":1,\"いる\":1,\"フォロー\":1,\"『\":1,\"/フォロー\":1,\"RT\":1,\"来\":1,\"楽\":1,\"の\":1,\"QMA\":1,\"開\":1,\"く\":1,\"あれ\":1,\"応\":1,\"、「\":1,\"し\":2,\"、ギターを\":1,\"お\":3,\"つ\":1,\"あ\":1,\"、BDFF\":1,\"幸\":1,\"見\":1,\"は\":1,\"!?」\":1,\"ステキ\":1,\"、あれ\":1,\"ある。\":1,\"踊\":1},\"す\":{\"シモ\":1,\"が\":5,\"。\":134,\"か\":1,\"と\":1,\"／\":1,\"。よろ\":1,\"♬\":1,\"る\":8,\"。タイムリー\":1,\"。リフォ\":1,\"♪\":112,\"(๑´ㅂ`๑)♡*.+゜\":1,\"。レース\":1,\"の\":3,\"！\":7,\"注\":2,\"。FRBお\":2,\"。サブアカウント@sachi_dears\":1,\"。『\":1,\"る、\":1,\"♥」\":1,\"み\":1,\"。　\":3,\"ぐ\":3,\"/\":1,\"」\":3,\"☆\":3,\"ぎ\":4,\"ね\":2,\"るボット\":1,\"！キーワード\":1,\"。※140\":1,\"　\":1,\"!!(^_-)-☆\":1,\"よ\":1,\"。「\":1,\"き\":1,\"♥\":1,\"w　\":1,\"、りい\":1,\"。えるお\":1,\"!!\":1,\"あり\":1,\"!!　\":1},\"シモ\":{\"野\":1},\"郎\":{\"で\":1},\"よろ\":{\"し\":4},\"し\":{\"く\":9,\"て\":19,\"な\":1,\"詳\":1,\"ま\":206,\"か\":2,\"、い\":1,\"い。\":1,\"愛\":1,\"た\":4,\"の\":1,\"い\":9,\"ん\":1,\"ろ\":4,\"づ\":1,\"は\":1,\"よう～♪\":1,\"い♪\":1,\"ろエピソード\":1,\"ろミサワ\":1,\"い、いろん\":1,\"ょ\":4,\"で\":1,\"ろい\":1,\"ら!?\":1,\"そ\":3,\"学\":1,\"す\":2,\"ん、H\":1,\"い」\":1,\"求\":1,\"ゅ\":1},\"く\":{\"…\":1,\"お\":4,\"だ\":7,\"さ\":1,\"な\":4,\"bot\":1,\"ヒントを\":1,\"れる\":2,\"「ラブライブ\":1,\"れ\":1,\"らい\":1,\"の\":1,\"ん\":1,\"は\":2,\"…。\":1,\"わ\":1,\"よ！」\":1,\"て\":1,\"る\":1,\"よう\":1,\"知\":1,\"べ\":1,\"い\":1,\"♪\":1,\"んラブ\":1,\"ね\":1,\"用\":1},\"…\":{\"最\":1},\"近\":{\"は\":2},\"MGS\":{\"と\":1},\"ブレイブルー、\":{\"音\":1},\"音\":{\"ゲーをプレイ\":1,\"を、\":1,\"」を\":1,\"も\":1,\"リンFutureStyle\":1},\"ゲーをプレイ\":{\"し\":1},\"て\":{\"ま\":4,\"TL\":1,\"る\":7,\"い\":22,\"強\":1,\"く\":8,\"し\":6,\"人\":6,\"も\":5,\"き\":2,\"愛\":1,\"紹\":2,\"いる\":6,\"み\":5,\"、\":4,\"ほ\":1,\"楽\":1,\"応\":1,\"笑\":2,\"あ\":1,\"自\":1,\"心\":1,\"あり\":1,\"作\":1,\"いう\":1,\"ツッコん\":1,\"仲\":1,\"少\":1,\"今\":1,\"る！」\":1,\"いれ\":1,\"の\":1,\"利\":1,\"は\":1,\")”×”　\":1},\"プリキュア\":{\"好\":1},\"サラリーマン\":{\"で\":1},\"。\":{\"好\":1,\"http://t.co/QMLJeFmfMT\":1,\"猫\":1,\"害\":1,\"の\":1,\"さ\":1,\"今\":2,\"\\r\\n\":15,\"日\":2,\"赤\":2,\"そ\":2,\"こ\":1,\"最\":1,\"地\":1,\"腐\":1,\"他\":1,\"週\":1,\"\\r\\nお\":1,\"主\":1,\"4/18.\":1,\"\\r\\nスゴイ\":1,\"\\r\\n「\":3,\"\\r\\n9/13（\":1,\"\\r\\nあ\":1,\"\\r\\nいい\":4,\"気\":2,\"詳\":1,\"問\":1,\"基\":1,\"解\":1,\"モンハン\":1,\"\\nSPRING\":1,\"で\":1,\"時\":1,\"\\r\\nわ\":1,\"\\r\\n「え\":1,\"\\r\\n「え～\":1,\"な\":1,\"致\":1,\"既\":1,\"嵐\":1},\"な\":{\"プリキュアシリーズ\":1,\"い\":15,\"ど\":4,\"方\":1,\"ん\":8,\"る\":5,\"ら\":3,\"ネタ\":1,\"れ*ﾟ\":1,\"り\":2,\"さ\":22,\"人\":60,\"言\":59,\"と\":63,\"い」をキャッチコピー\":1,\"お、\":2,\"い！\":1,\"男\":2,\"に\":1,\"が\":2,\"ペアルックを\":1,\"っ\":4,\"日\":1,\"ドレスを\":1,\"愛\":1,\"の\":4,\"ジャンル\":1,\"い、\":2,\"笑\":1,\"会\":1,\"～\":1,\"れる\":1,\"で\":1,\"いネタ\":1,\"ラテアートを、\":1,\"りツボ\":1,\"昔\":1,\"い、あ\":1,\"''\":1,\"いスゴイ\":1,\"ギネス\":1,\"キャラ\":1,\"た\":3,\"いう\":1,\"行\":1,\"い「お・ん・\":1,\"思\":1,\"、あ\":1,\"世\":1,\"ぁ」\":1,\"スイーツ\":2,\"気\":1,\"れ\":2,\"素\":2,\"ろう♪\":1,\"る！？　\":1,\"生\":1,\"、\":3,\"るよう\":1,\"究\":1,\"恋\":1,\"感\":1,\"ケーキを\":1,\"アディダス\":1,\"私\":1,\"ふ\":1,\"インテリアを、\":1,\"か\":1,\"情\":1},\"プリキュアシリーズ\":{\"は\":1},\"ハートキャッチ、\":{\"最\":1},\"愛\":{\"の\":1,\"し\":3,\"さ\":1,\"情\":1,\"い\":1,\"経\":1,\"に\":1},\"キャラクター\":{\"は\":1},\"月\":{\"影\":1,\"克\":1},\"影\":{\"ゆ\":1},\"ゆ\":{\"り\":1,\"ん[\":1},\"さ\":{\"ん\":5,\"ん＊\":1,\"せ\":2,\"み\":1,\"ら\":1,\"を\":1,\"れ\":2,\"ん、お\":22,\"ん/\":1,\"い（＾∇＾）✨\":1,\"んおう\":1,\"ち\":1,\"れる\":1,\"い。\":3,\"れるイラストを\":1,\"んTEAM\":1,\"い\":1,\"れる「\":1,\"い☆\":1,\"い！(\":1,\"ん、コナン、\":1,\"す\":1},\"http://t.co/QMLJeFmfMT\":{\"ご\":1},\"ご\":{\"質\":1,\"自\":1,\"了\":1,\"一\":2,\"確\":1,\"注\":2,\"ざ\":1},\"質\":{\"問\":1},\"問\":{\"、お\":1,\"い\":1,\"題\":3,\"（\":1},\"、お\":{\"問\":1,\"願\":62,\"も\":2},\"い\":{\"合\":1,\"方\":2,\"し\":120,\"ま\":21,\"て\":10,\"た\":6,\"犬\":1,\"こ\":2,\"ち\":2,\"記\":1,\"と\":6,\"好\":1,\"で\":12,\"き\":4,\"場\":1,\"致\":3,\"っ\":2,\"内\":1,\"意\":1,\"風\":1,\"の\":2,\"つ\":2,\"イイ\":1,\"気\":1,\"挨\":1,\"台\":1,\"所\":1,\"人\":4,\"も\":1,\"な\":3,\"ね\":1,\"ど\":1,\"女\":2,\"男\":1,\"や\":1,\"く\":1},\"合\":{\"わ\":1,\"も\":1,\"上\":1},\"わ\":{\"せ\":1,\"か\":7,\"ず\":6,\"っ\":1},\"こ\":{\"ち\":1,\"す\":1,\"と\":11,\"さ\":1,\"っ\":1,\"の\":2,\"れ\":2,\"ま\":1,\"う。」\":1,\"ん\":2,\"で\":1},\"ち\":{\"ら\":1,\"ゃ\":8,\"い\":1,\"訳\":1,\"❷)\":1,\"の\":1,\"ょ\":1,\"ば\":1,\"ろ\":1,\"に\":1,\"あい\":1,\"家\":1,\"わるい\":1},\"ら\":{\"http://t.co/LU8T7vmU3h\":1,\"な\":12,\"し\":2,\"大\":1,\"だ\":2,\"に\":1,\"RT\":90,\"生\":1,\"は\":1,\"商\":1,\"出\":1,\"是\":2,\"別\":1,\"め\":1,\"で\":1,\"見\":1,\"置\":1,\"ぬ\":1},\"http://t.co/LU8T7vmU3h\":{},\"/\":{\"XXX\":1,\"@andprotector\":1,\"@lifefocus0545\":1,\"森\":1,\"高\":1,\"演\":1,\"黒\":1,\"現\":2},\"XXX\":{\"/\":1},\"@andprotector\":{\"/\":1},\"@lifefocus0545\":{\"potato\":1},\"potato\":{\"design\":1},\"design\":{\"works\":1},\"works\":{},\"RT\":{\"し\":2,\"&\":98,\"＆\":8,\"禁\":1},\"TL\":{\"に\":1,\"反\":1},\"に\":{\"濁\":1,\"な\":12,\"よる\":1,\"入\":10,\"あり\":1,\"。スパム\":1,\"貢\":1,\"記\":1,\"つ\":7,\"で\":59,\"必\":58,\"動\":1,\"、タイヤ\":1,\"フォロー\":1,\"も\":2,\"生\":2,\"係\":1,\"か\":1,\"は\":5,\"着\":1,\"思\":1,\"見\":1,\"呟\":1,\"使\":1,\"、\":1,\"立\":2,\"七\":1,\"大\":1,\"し\":2,\"RT\":1,\"ハマ\":1,\"南\":1,\"閉\":1,\"マッチ\":1,\"や\":2,\"残\":2,\"絡\":1,\"お\":1,\"。\":1,\"コレ\":1,\"相\":1,\"た\":1,\"が\":1,\"御\":1,\"いる\":1,\"出\":1,\"モテるよう\":1,\"!?\":1,\"一\":1,\"ロー、\":1,\"す\":1,\"い\":1,\"据\":1,\"作\":1,\"う\":1,\"乾\":1,\"嬉\":1,\"頑\":1},\"濁\":{\"流\":1},\"流\":{\"を\":1},\"を\":{\"起\":1,\"つ\":5,\"連\":1,\"知\":1,\"磨\":1,\"精\":58,\"瞬\":1,\"味\":1,\"感\":1,\"全\":2,\"見\":10,\"紹\":1,\"集\":4,\"発\":1,\"抽\":1,\"応\":1,\"守\":1,\"作\":1,\"や\":1,\"疑\":1,\"壊\":1,\"探\":2,\"理\":1,\"さ\":1,\"除\":1},\"起\":{\"こ\":1,\"YUNHO＆CHANGMIN\":1,\"及\":1},\"か\":{\"らフォロー\":1,\"つ\":1,\"な\":3,\"ら\":9,\"た\":1,\"ら！\":1,\"し\":4,\"っ\":20,\"る\":4,\"く\":1,\"り\":2,\"わいい\":3,\"ん\":2,\"わ\":2,\"も\":2,\"！？\":1,\"～♪\":1,\"を\":1,\"は\":1,\"よ\":1,\"る～\":1,\"わいい♥モテ\":1,\"ち\":1,\"「あ～\":1,\"わいいペットを\":1,\"？\":1,\"い\":1,\"ぐ\":1,\"れる\":1},\"らフォロー\":{\"し\":1},\"方\":{\"が\":1,\"@1life_5106_hshd\":1,\"をフォロー\":1,\"丁\":1,\"神\":2,\"・\":1,\"の\":1},\"良\":{\"いよ\":1,\"く\":1},\"いよ\":{\"言\":1},\"っ\":{\"て\":37,\"た\":113,\"ぱ\":6,\"そ\":1,\"ち\":4,\"と\":4,\"か\":1,\"」\":2,\"！いい\":1,\"　マジ\":1,\"˘ω˘c\":1},\"る\":{\"こ\":2,\"の\":4,\"と\":4,\"系\":1,\"た\":58,\"け\":1,\"っ\":2,\"べ\":2,\"表\":1,\"素\":1,\"だ\":3,\"／\":1,\"三\":1,\"非\":1,\"画\":1,\"か\":2,\"あ\":1,\"人\":2,\"で\":1,\"も\":1,\"学\":1,\"比\":1,\"が\":1,\"僕\":1,\"腐\":1},\"も\":{\"つ\":2,\"こ\":3,\"の\":6,\"幸\":58,\"好\":6,\"「チャンピオンタイヤ\":1,\"あり\":3,\"ホント\":1,\"わ\":1,\"らえる、あるあるを\":1,\"使\":1,\"、\":2,\"お\":3,\"し\":7,\"らえる\":1,\"は\":1,\"う\":3,\"、い\":1,\"''\":1,\"教\":1,\"宜\":1,\"め\":1,\"♪\":1,\"大\":1,\"多\":1,\"、わ\":1,\"!?\":1,\"文\":1,\"や\":1,\"、フォローあり\":1,\"人\":1,\"記\":1,\"コレ\":1,\"食\":1,\"らえ\":1,\"っ\":2,\"いい\":1,\"呟\":1,\"ち\":1},\"つ\":{\"ま\":1,\"ぶ\":14,\"い\":4,\"け\":19,\"か\":3,\"練\":1,\"ハンドサイン\":1,\"の\":1,\"と\":1,\"恋\":1,\"いー\":1,\"る\":1},\"詳\":{\"細\":1,\"し\":2},\"細\":{\"→http://t.co/ANSFlYXERJ\":1},\"→http://t.co/ANSFlYXERJ\":{\"相\":1},\"相\":{\"方\":1,\"当\":1,\"互\":91,\"手\":1},\"@1life_5106_hshd\":{\"葛\":1},\"葛\":{\"西\":1},\"西\":{\"教\":1,\"→\":1},\"教\":{\"徒\":1,\"え\":1},\"徒\":{\"そ\":1},\"そ\":{\"の\":3,\"ん\":70,\"り\":1,\"し\":1,\"う\":5,\"う。\":1,\"れ\":2},\"壱\":{},\"ぱ\":{\"ん\":1,\"りモテモテ\":1,\"いあるん\":1,\"り\":3,\"りアナ\":1},\"猫\":{\"×6、\":1,\"、\":1,\"＊\":1},\"×6、\":{\"大\":1},\"大\":{\"学\":1,\"　\":1,\"好\":4,\"人\":2,\"会\":1,\"型\":2,\"、\":1},\"学\":{\"・\":1,\"をお\":1,\"苑\":1,\"ぶ\":1,\"や\":1,\"生\":1},\"・\":{\"高\":1,\"旦\":1,\"兵\":1,\"非\":1,\"鍵\":1},\"校\":{\"・\":1,\"軟\":1},\"旦\":{\"那\":1},\"那\":{\"各\":1},\"各\":{\"1\":1},\"暮\":{\"ら\":1},\"、\":{\"子\":1,\"日\":1,\"庭\":1,\"人\":1,\"応\":1,\"ご\":1,\"実\":1,\"愛\":1,\"選\":1,\"た\":1,\"見\":2,\"や\":1,\"嵐\":1,\"ど\":1,\"困\":1,\"必\":2,\"腐\":1,\"気\":2,\"も\":1,\"是\":1,\"ま\":2,\"表\":1,\"神\":1,\"最\":1,\"妹\":1,\"全\":2,\"思\":1,\"動\":1,\"男\":1,\"本\":1,\"そ\":1,\"美\":1,\"家\":1,\"作\":1,\"建\":1,\"後\":1,\"党\":1,\"光\":1},\"子\":{\"供\":1,\"＊.゜\":1,\"に\":2,\"の\":2,\"。\":2,\"中\":1,\"園\":1,\"高\":1,\"な\":1,\"，\":1,\"で\":1},\"供\":{\"、\":1,\"給\":1},\"日\":{\"常\":6,\"に\":1,\"も\":1,\"々\":1,\"本\":1},\"常\":{\"思\":1,\"ツイート\":2,\"の\":2,\"を\":1},\"思\":{\"っ\":80,\"い\":5,\"わ\":6,\"う\":1},\"た\":{\"事\":1,\"だ\":1,\"く\":3,\"も\":2,\"い\":16,\"め\":63,\"二\":1,\"い！\":2,\"ら\":92,\"らRT\":8,\"プリ/\":1,\"い。\":1,\"。\":1,\"ま\":1,\"表\":1,\"ち\":2,\"「\":1,\"時\":1,\"人\":2,\"/\":1,\"らDM\":1,\"ん\":1,\"の\":5,\"感\":1,\"ら、\":4,\"ど\":1,\"らいい\":1,\"、\":1,\"ららRT\":1,\"～！\":1,\"い♪　\":1,\"よww]」\":1,\"は\":1},\"事\":{\"を\":1,\"な\":1,\"は\":1,\"情\":1,\"】り\":1},\"ぶ\":{\"や\":14,\"り\":1,\"こ\":1},\"や\":{\"い\":1,\"か\":1,\"く\":2,\"っ\":11,\"人\":1,\"タイヤ\":1,\"き\":10,\"簡\":1,\"、\":1,\"何\":1,\"リプライ\":1,\"さ\":2,\"、あるあるを\":2,\"芸\":1,\"り\":1,\"、お\":1,\"グッズ\":1,\"ろー。ロビン\":1,\"マメ\":1,\"め\":1},\"／\":{\"今\":1,\"猫\":1},\"今\":{\"年\":3,\"シーズン\":1,\"か\":1,\"日\":1,\"現\":1,\"す\":1,\"天\":1},\"年\":{\"の\":1,\"サンデー\":1,\"も\":1,\"２３\":1,\"目\":1},\"目\":{\"標\":1,\"的\":1,\"管\":1,\"JSB\":1,\"線\":2,\"アイテムを\":1,\")ゾロ\":1},\"標\":{\"：\":1},\"：\":{\"読\":1,\"歌\":1},\"読\":{\"書\":1,\"モ\":1,\"お\":2,\"！】⇒\":1},\"書\":{\"、\":1,\"、「\":1,\"士\":1},\"庭\":{\"の\":1},\"手\":{\"入\":1,\"芸\":1,\"動\":1,\"権\":1,\"を\":1,\"く\":1,\"や\":1},\"入\":{\"れ、ランニング、\":1,\"り\":1,\"っ\":9},\"れ、ランニング、\":{\"手\":1},\"芸\":{\"／\":1,\"術\":1},\"＊\":{\"花\":1,\"写\":1,\"詩\":1,\"林\":1},\"花\":{\"＊\":1},\"写\":{\"真\":2},\"真\":{\"＊\":1,\"を\":1},\"詩\":{\"＊\":1},\"林\":{\"も\":1},\"ん＊\":{\"鉄\":1},\"鉄\":{\"道\":1},\"道\":{\"な\":1,\"」\":1,\"ぐ\":1,\"具\":3},\"ど\":{\"好\":1,\"を\":2,\"言\":1,\"れ\":1,\"をお\":1,\"ん\":4,\"う\":3,\"り\":1,\"前\":1},\"をフォロー\":{\"さ\":1},\"だ\":{\"い\":2,\"ら\":1,\"と\":61,\"さ\":6,\"』\":1,\"け\":7,\"か\":2,\"言\":2,\"ま\":1,\"知\":1,\"、トップ、\":1,\"よ☆～（ゝ。∂）\":1,\"っ\":3},\"。よろ\":{\"し\":1},\"お\":{\"願\":12,\"気\":1,\"さ\":1,\"か\":1,\"熱\":1},\"願\":{\"い\":122},\"♬\":{},\"湯\":{\"の\":1},\"街\":{\"の\":1},\"勃\":{\"酩\":1},\"酩\":{\"姦\":1},\"姦\":{\"な\":1},\"ゃ\":{\"ら\":1,\"う♪\":2,\"う\":1,\"ん\":2,\"い(\":1,\"り\":1},\"　\":{\"赤\":1,\"笑\":1},\"赤\":{\"い\":1,\"葦\":2},\"犬\":{\"の\":1,\"（\":1},\"（\":{\"外\":1,\"行\":1,\"か\":1},\"外\":{\"資\":1,\"な\":1,\"と\":1,\"で\":1},\"資\":{\"系\":1},\"系\":{\"）　\":1,\"女\":1,\"ま\":1},\"）　\":{\"肥\":1},\"肥\":{\"後\":1},\"後\":{\"で\":1,\"ま\":1,\"か\":1},\"緑\":{\"ナンバー\":1},\"ナンバー\":{\"屋\":1},\"屋\":{\"さ\":1,\"も\":1},\"勤\":{\"め\":1},\"め\":{\"\":1,\"の\":2,\"に\":60,\"て\":7,\"られ\":2,\"た\":1,\"で\":1,\"・あら\":1,\"な\":2,\"雑\":1,\"ず\":1,\"せ\":1},\"\":{\"\\n\":1,\"\\r\\n\":1},\"\\n\":{\"く\":1},\"、い\":{\"ち\":1,\"き\":1},\"訳\":{\"の\":1,\"、シルバーアクセサリ、……\":1},\"記\":{\"号\":1,\"さ\":1,\"録\":2,\"憶\":1},\"号\":{\"を\":1,\"は\":1},\"連\":{\"呼\":1,\"の\":1,\"載\":1},\"呼\":{\"す\":1},\"当\":{\"邪\":1,\"分\":1,\"代\":1,\"に\":1},\"邪\":{\"魔\":1},\"魔\":{\"に\":1},\"害\":{\"は\":1},\"像\":{\"と\":1,\"、ニュース\":1,\"を\":2,\"、お\":1,\"も\":1,\"が\":1,\"や\":1,\"をを、\":1},\"上\":{\"げ\":1,\"、\":1,\"手\":1,\"は\":1},\"げ\":{\"ま\":1,\"て\":1},\"い。\":{\"車\":1,\"\\r\\n\":3,\"ブログ→http://t.co/8E91tqoeKX　　\":1},\"車\":{\"輪\":1,\"が\":1},\"輪\":{\"の\":1},\"川\":{\"之\":3},\"之\":{\"江\":3},\"江\":{\"中\":3},\"中\":{\"高\":4,\"の\":2,\"本\":1,\"心\":2,\"。TVアニメ『THE\":1,\"尉\":1,\"/\":1,\"に\":2,\"で\":1,\"」\":1,\"国\":1},\"生\":{\"の\":5,\"に\":2,\"を\":60,\"き\":59,\"ま\":1,\"々\":2,\"達\":1,\"態\":2},\"よる\":{\"川\":1},\"あるあるアカウント\":{\"で\":1},\"。タイムリー\":{\"な\":1},\"ネタ\":{\"は\":1,\"雑\":1},\"気\":{\"に\":11,\"持\":1,\"軽\":5,\"分\":2,\"ww　い\":1,\"ま\":1,\"者\":1,\"が\":1},\"あり\":{\"ま\":6,\"無\":1,\"が\":1},\"bot\":{\"遊\":1,\"で\":2},\"遊\":{\"び\":1},\"び\":{\"と\":1,\"YUNHO＆CHANGMINを\":1,\"完\":1},\"実\":{\"況\":1,\"は\":1},\"況\":{\"が\":1},\"主\":{\"目\":1,\"催\":1,\"に\":1},\"的\":{\"の\":1,\"名\":1,\"に\":2,\"新\":2,\"大\":2,\"曲\":1,\"追\":1,\"代\":1},\"趣\":{\"味\":3},\"味\":{\"アカウント。\":1,\"わおう。\":1,\"用\":1,\"が\":1,\"し\":3,\"で\":1},\"アカウント。\":{\"成\":1},\"成\":{\"人\":4,\"一\":1},\"人\":{\"済\":3,\"は\":10,\"生\":61,\"の\":4,\"に\":3,\"気\":2,\"で\":2,\"を\":2,\"腐\":1,\"へ\":1,\"か\":1,\"な\":1,\"間\":1,\"、\":1,\"い\":1,\"们\":2,\"指\":1,\"权\":1},\"済\":{\"♀。\":1,\"腐\":2},\"♀。\":{\"時\":1},\"時\":{\"々TLお\":1,\"に\":2,\"や\":1,\"追\":1,\"々、\":1,\"ふ\":1},\"々TLお\":{\"騒\":1},\"騒\":{\"が\":1},\"。リフォ\":{\"率\":1},\"率\":{\"低\":1},\"低\":{\"い\":1},\"Ｆ／Ｂ\":{\"ご\":1},\"自\":{\"由\":3,\"誓\":1,\"分\":62,\"己\":1},\"由\":{\"に\":1,\"、\":1,\"，\":1},\"。スパム\":{\"は\":1},\"ブロック！[HOT]K[アニメ]タイバニ/Ｋ/\":{\"薄\":1},\"薄\":{\"桜\":1},\"桜\":{\"鬼\":1},\"鬼\":{\"/トライガン/\":1},\"/トライガン/\":{\"進\":1},\"進\":{\"撃\":3},\"撃\":{\"[\":1,\"/ハイキュー/BLEACH/う\":1,\"、クレ\":1},\"[\":{\"小\":1,\"漫\":1},\"小\":{\"説\":1,\"森\":1},\"説\":{\"]\":1,\"も\":1,\"を\":1},\"]\":{\"冲\":1,\"内\":1,\"声\":1},\"冲\":{\"方\":1},\"丁\":{\"/\":1},\"森\":{\"博\":1,\"隼\":1},\"博\":{\"嗣\":1},\"嗣\":{\"[\":1},\"漫\":{\"画\":2},\"内\":{\"藤\":1,\"容\":4},\"藤\":{\"泰\":1},\"泰\":{\"弘\":1},\"弘\":{\"/\":1},\"河\":{\"ゆ\":1},\"ん[\":{\"他\":1},\"他\":{\"]\":1,\"好\":1,\"に\":1},\"声\":{\"優\":2},\"優\":{\"/\":1,\"さ\":1},\"演\":{\"劇\":2},\"劇\":{\"※@sano_bot1\":1,\"団\":1,\"、ネットワークエンジニア、ライター、プログラマ、\":1},\"※@sano_bot1\":{\"二\":1},\"二\":{\"代\":2,\"十\":1},\"代\":{\"目\":2,\"わり\":1,\"表\":2,\"红\":1},\"管\":{\"理\":1},\"理\":{\"人\":1,\"想\":1,\"解\":2},\"アイコン\":{\"は\":1},\"兄\":{\"さ\":1},\"ら！\":{},\"ﾟ.＊97line\":{\"お\":1},\"貢\":{\"い\":1},\"女\":{\"子\":10,\"の\":2,\"を\":1,\"そ\":1,\"性\":1},\"＊.゜\":{\"DISH//\":1},\"DISH//\":{\"✯\":1},\"✯\":{\"佐\":1,\"読\":1,\"WEGO\":1,\"嵐\":1},\"佐\":{\"野\":1},\"悠\":{\"斗\":1},\"斗\":{\"✯\":1},\"モ\":{\"✯\":1},\"WEGO\":{\"✯\":1},\"嵐\":{\"I\":1,\"が\":1,\"好\":1,\"と\":1},\"I\":{\"met\":1,\"surprise\":1},\"met\":{\"@OTYOfficial\":1},\"@OTYOfficial\":{\"in\":1},\"in\":{\"the\":1},\"the\":{\"London\":1},\"London\":{\";)\":1},\";)\":{},\"2310*basketball#41*UVERworld*Pooh☪Bell\":{\"+.｡*\":1},\"+.｡*\":{\"弱\":1},\"弱\":{\"さ\":1,\"虫\":1},\"知\":{\"っ\":6,\"り\":1,\"ら\":6,\"られ\":1,\"識\":1},\"強\":{\"く\":1},\"れ*ﾟ\":{},\"宮\":{\"本\":1},\"本\":{\"武\":1,\"音\":3,\"人\":1,\"物\":1,\"試\":1,\"的\":1,\"気\":1,\"の\":1,\"一\":1,\"身\":1,\"推\":1,\"当\":1,\"は\":1},\"武\":{\"蔵\":1,\"田\":1},\"蔵\":{\"の\":1},\"誓\":{\"書\":1},\"、「\":{\"獨\":1,\"機\":1},\"獨\":{\"行\":1},\"行\":{\"道\":1,\"機\":1,\"こ\":1,\"動\":1,\"政\":2},\"」\":{\"に\":1,\"\\r\\nジャニーズ\":1,\"今\":1,\"こ\":1,\"が\":1,\"て\":1,\"詳\":1,\"と\":1},\"れ\":{\"た\":3,\"て\":1,\"も\":2,\"ま\":1,\"は\":1,\"ぞ\":1,\"の\":1,\"ば\":1,\"知\":1,\"ぼ\":1},\"十\":{\"一\":1},\"一\":{\"箇\":1,\"杯\":58,\"読\":2,\"つ\":1,\"部\":1,\"覧\":1,\"途\":1,\"度\":1,\"緒\":1,\"致\":3,\"种\":1},\"箇\":{\"条\":1},\"条\":{\"をランダム\":1,\"件\":1},\"をランダム\":{\"に\":1},\"りモテモテ\":{\"男\":1},\"男\":{\"子\":2,\"バスマネ2\":1,\"性\":3,\"の\":1,\"女\":2},\"い！\":{\"自\":1,\"応\":1,\"で\":1},\"分\":{\"を\":2,\"が\":58,\"の\":2,\"も\":1,\"に\":2,\"野\":1,\"な\":1,\"子\":1},\"磨\":{\"く\":1},\"ヒントを\":{\"み\":1},\"け\":{\"た\":6,\"し\":64,\"ど\":2,\"て\":5,\"で\":5,\"ま\":8,\"中\":1,\"る\":2,\"TL\":1,\"ん\":1,\"られ\":1,\"家\":1},\"応\":{\"援\":7,\"。/\":1},\"援\":{\"し\":4,\"よろ\":1,\"す\":1,\"本\":1},\"れる\":{\"人\":1,\"た\":1,\"問\":1,\"と\":1,\"も\":1},\"&\":{\"相\":90,\"フォローお\":11,\"フォローを、お\":2,\"フォロー\":4},\"互\":{\"フォロー\":86,\"フォローお\":5},\"ん、お\":{\"願\":22},\"♪\":{\"\\r\\nいい\":58,\"気\":1,\"\\r\\n\":10,\"\\r\\nディズニーファン\":1,\"\\r\\nいろいろ\":1,\"いい\":1,\"面\":2,\"\\r\\nデイジー\":1,\"\\r\\nお\":1,\"た\":1},\"幸\":{\"せ\":118},\"周\":{\"り\":58},\"る！\":{\"\\r\\n\":58},\"\\r\\n\":{\"そ\":68,\"面\":9,\"公\":1,\"庶\":1,\"気\":8,\"特\":1,\"着\":1,\"考\":1,\"少\":2,\"使\":2,\"み\":1,\"他\":1,\"同\":1,\"ど\":1,\"可\":1,\"本\":1,\"意\":1,\"私\":1,\"女\":1,\"思\":1,\"食\":1,\"知\":1,\"人\":1,\"見\":1,\"美\":1,\"今\":1},\"精\":{\"一\":58,\"英\":1},\"杯\":{\"生\":58,\"」\":1,\"。\":1},\"必\":{\"要\":58,\"ず\":1,\"読\":1,\"然\":1},\"要\":{\"な\":58,\"素\":1},\"葉\":{\"をお\":58,\"の\":1},\"をお\":{\"届\":63,\"伝\":1},\"届\":{\"け\":65},\"\\r\\nいい\":{\"な\":63},\"格\":{\"言\":1},\"心\":{\"や\":1,\"ある\":1,\"で\":1,\"の\":1,\"に\":1},\"瞬\":{\"時\":1},\"う\":{\"こ\":1,\"す\":2,\"の\":1,\"内\":2,\"さ\":1,\"だ\":3,\"一\":2,\"や\":2,\"別\":1,\"男\":1,\"な\":2,\"に\":1,\"か\":1,\"で\":1,\"ち\":1,\"つ\":1,\"ご\":1},\"ある。\":{\"\\r\\n\":1},\"重\":{\"み\":1},\"わおう。\":{\"\\r\\n\":1},\"面\":{\"白\":11,\"を\":1,\"が\":1},\"白\":{\"か\":11},\"らRT\":{\"&\":8},\"F1.GP2.Superformula.SuperGT.F3...\":{\"\\nスーパーGT\":1},\"\\nスーパーGT\":{\"が\":1},\"♡\":{\"車\":1,\"Respect\":1,\"欲\":1},\"！\":{\"新\":1,\"飛\":1,\"こ\":1,\"な\":1,\"\\r\\n\":4,\"イラスト\":1,\"マンガ\":1,\"随\":1},\"新\":{\"幹\":1,\"党\":1,\"闻\":2},\"幹\":{\"線\":1},\"線\":{\"も\":1,\"で\":1,\"か\":1},\"飛\":{\"行\":1},\"機\":{\"も\":1,\"能\":2},\"別\":{\"アカ\":1,\"な\":1,\"世\":1,\"で\":1},\"アカ\":{\"で\":1},\"(๑´ㅂ`๑)♡*.+゜\":{},\"ブリヂストン\":{\"の\":1},\"スポーツタイヤ「POTENZA」\":{\"の\":1},\"アカウント\":{\"で\":6,\"が\":1},\"。レース\":{\"や\":1},\"タイヤ\":{\"の\":1},\"シーズン\":{\"も\":1},\"「チャンピオンタイヤ\":{\"の\":1},\"称\":{\"号\":1},\"譲\":{\"ら\":1},\"い」をキャッチコピー\":{\"に\":1},\"、タイヤ\":{\"供\":1},\"給\":{\"チームを\":1},\"チームを\":{\"全\":1},\"全\":{\"力\":2,\"う\":1,\"国\":1,\"滅\":1,\"員\":1},\"力\":{\"で\":2,\"をお\":1,\"于\":1},\"サポート\":{\"し\":1},\"お、\":{\"返\":1,\"日\":1},\"返\":{\"信\":1,\"し\":1,\"事\":1},\"信\":{\"が\":1,\"し\":1},\"場\":{\"合\":1,\"す\":1,\"面\":2},\"了\":{\"承\":1,\"検\":1,\"怎\":1},\"承\":{\"よろ\":1},\"致\":{\"し\":3,\"通\":1,\"”\":2,\"力\":1},\"え\":{\"な\":2,\"の\":2,\"さ\":1,\"て\":3,\"置\":1,\"し\":1},\"ホント\":{\"は\":1},\"いあるん\":{\"で\":1},\"を、\":{\"つ\":1},\"持\":{\"わ\":1},\"フォローお\":{\"願\":21,\"断\":1},\"銀\":{\"魂\":1},\"魂\":{\"/\":1},\"黒\":{\"バス/\":1},\"バス/\":{\"進\":1},\"/ハイキュー/BLEACH/う\":{\"た\":1},\"プリ/\":{\"鈴\":1},\"鈴\":{\"木\":1},\"木\":{\"達\":1},\"達\":{\"央\":1,\"に\":1,\"の\":1},\"央\":{\"さ\":1},\"ん/\":{\"神\":1},\"神\":{\"谷\":1,\"は\":1,\"起\":2},\"谷\":{\"浩\":1},\"浩\":{\"史\":1},\"史\":{\"さ\":1},\"軽\":{\"に\":5,\"い\":1},\"い（＾∇＾）✨\":{},\"HQ!!\":{\"成\":2},\"腐\":{\"女\":5,\"・R18・ネタバレ\":1,\"の\":1},\"ツイート\":{\"多\":2},\"多\":{\"い\":2,\"め\":3,\"に\":1,\"く\":1},\"葦\":{\"京\":2},\"京\":{\"治\":2,\"介\":1},\"治\":{\"夢\":2},\"夢\":{\"豚\":2,\"く\":1,\"を\":1},\"豚\":{\"クソツイ\":2},\"クソツイ\":{\"含\":2},\"含\":{\"み\":2},\"注\":{\"意\":4,\"目\":1},\"意\":{\"。フォローをお\":2,\"味\":1,\"。\":1,\"を。\":1,\"外\":2,\"见\":1},\"。フォローをお\":{\"考\":2},\"考\":{\"え\":3},\"際\":{\"は\":2},\"プロフ\":{\"ご\":2,\"で\":1,\"参\":1},\"。FRBお\":{\"気\":2},\"んおう\":{\"男\":1},\"バスマネ2\":{\"ね\":1},\"ね\":{\"ん（＾ω＾）\":1,\"。\":1,\"ww\":1,\"～♪\":1,\"♪\":1,\"～」\":1,\"〜\":1},\"ん（＾ω＾）\":{},\"らえる、あるあるを\":{\"見\":1},\"見\":{\"つ\":18,\"て\":7,\"間\":1,\"え\":1,\"た\":1,\"る\":1},\"物\":{\"関\":1,\"た\":1,\"と\":1,\"の\":1},\"関\":{\"連\":1,\"西\":1,\"東\":1},\"。サブアカウント@sachi_dears\":{\"(\":1},\"(\":{\"さ\":1,\"基\":1,\"同\":1},\"❷)\":{\"も\":1},\"。『\":{\"心\":1},\"ある\":{\"も\":1,\"事\":1,\"な\":1,\"と\":1},\"皆\":{\"、\":1},\"情\":{\"を\":1,\"に\":1,\"報\":2,\"。\":1},\"感\":{\"じ\":1,\"動\":2},\"じ\":{\"な\":1,\"境\":1,\"込\":1},\"べ\":{\"き\":2,\"く\":1,\"た\":2},\"』\":{\"公\":1},\"アッサム\":{\"山\":2},\"山\":{\"中\":2},\"用\":{\"アカ。\":1,\"と\":1,\"が\":1,\"す\":1},\"アカ。\":{\"当\":1},\"間\":{\"、\":1,\"違\":1,\"に\":2,\"で\":1},\"選\":{\"挙\":1,\"法\":1,\"手\":1},\"挙\":{\"啓\":1},\"啓\":{\"発\":1},\"発\":{\"用\":1,\"http://t.co/96UqoCo0oU\":1,\"信\":1,\"想\":2},\"使\":{\"っ\":4,\"えるフレーズ\":1,\"えるランキングを\":1},\"@assam_yamanaka\":{\"の\":1},\"確\":{\"認\":2},\"認\":{\"下\":1,\"及\":1},\"下\":{\"さ\":1,\"ネタ\":1},\"公\":{\"選\":1,\"式\":8,\"开\":1},\"法\":{\"に\":1,\"分\":1,\"上\":1},\"係\":{\"る\":1},\"表\":{\"示\":1,\"情\":1,\"現\":1,\"，\":1,\"任\":1},\"示\":{\"\":1},\"庶\":{\"民\":1},\"民\":{\"新\":1},\"党\":{\"#\":1,\"派\":1},\"#\":{\"脱\":1,\"I\":1},\"脱\":{\"原\":1},\"原\":{\"発\":1},\"http://t.co/96UqoCo0oU\":{\"\\r\\nonestep.revival@gmail.com\":1},\"\\r\\nonestep.revival@gmail.com\":{},\"ラブラブ\":{\"度\":1},\"度\":{\"が\":1,\"UP\":1,\"わ\":1},\"アップ\":{\"す\":1},\"る、\":{\"素\":1},\"素\":{\"敵\":5,\"あり\":1},\"敵\":{\"な\":5},\"ペアルックを\":{\"見\":1},\"紹\":{\"介\":4},\"介\":{\"し\":4,\"』\":1},\"「ラブライブ\":{\"が\":1},\"～\":{\"す\":1,\"と\":1},\"♥」\":{\"\\r\\nラブライブファン\":1},\"\\r\\nラブライブファン\":{\"に\":1},\"容\":{\"ば\":1,\"をお\":1,\"の\":1,\"だ\":1},\"ば\":{\"か\":1,\"な\":2,\"いい。ルフィ\":1,\"も\":1},\"集\":{\"め\":6},\"いる\":{\"だ\":2,\"部\":1,\"危\":1,\"の\":2,\"と\":1,\"比\":1},\"欲\":{\"し\":2,\"望\":1},\"う♪\":{\"\\r\\n\":3},\"特\":{\"別\":1},\"着\":{\"る\":1,\"て\":1},\"ドレスを\":{\"見\":1},\"ふ\":{\"と\":1,\"う\":1,\"れ\":1},\"ず\":{\"キュン\":1,\"役\":1,\"笑\":2,\"ら\":1,\"耳\":1,\"「\":1,\"言\":1},\"キュン\":{\"と\":1},\"フォローを、お\":{\"願\":4},\"ディズニー\":{\"の\":1},\"わいい\":{\"画\":2,\"と\":1},\"、ニュース\":{\"情\":1},\"報\":{\"、あるある\":1,\"をお\":1},\"、あるある\":{\"な\":1},\"\\r\\nディズニーファン\":{\"は\":1},\"深\":{\"い\":1},\"込\":{\"め\":2},\"られ\":{\"た\":2,\"て\":3},\"「\":{\"生\":1,\"そ\":2,\"ほ\":1},\"々\":{\"し\":2,\"探\":1,\"家\":1},\"風\":{\"刺\":1},\"刺\":{\"画\":1},\"」を\":{\"見\":1,\"つ\":1},\"\\r\\nいろいろ\":{\"集\":1},\"ほ\":{\"し\":1,\"ん\":3},\"ROM\":{\"っ\":1},\"楽\":{\"し\":4},\"ん…。ツイート\":{\"数\":1},\"数\":{\"多\":1,\"が\":1,\"通\":1},\"・あら\":{\"ぶ\":1},\"非\":{\"推\":1,\"公\":7,\"RT\":6},\"推\":{\"奨\":1,\"言\":1},\"奨\":{\"で\":1},\"早\":{\"兵\":1,\"く\":1},\"兵\":{\"・\":1,\"部\":2,\"庫\":1,\"攻\":1},\"受\":{\"け\":1,\"“\":1},\"BLNL\":{\"な\":1},\"地\":{\"雷\":1},\"雷\":{\"少\":1},\"少\":{\"な\":1,\"年\":1,\"し\":3},\"雑\":{\"多\":1,\"学\":2,\"食\":1},\"呟\":{\"き\":1,\"く\":1,\"い\":1},\"・R18・ネタバレ\":{\"有\":1},\"有\":{\"る\":1,\"名\":1},\"ジャンル\":{\"は\":1},\"参\":{\"照\":1},\"照\":{\"願\":1},\"。　\":{\"主\":1,\"\\r\\nミサワを\":1,\"\\r\\nウザいｗ\":1,\"ど\":1},\"催\":{\"→@chounou_antholo\":1,\"さ\":1},\"→@chounou_antholo\":{},\"家\":{\"。\":1,\"具\":2,\"財\":1,\"の\":1,\"に\":1,\"、\":1},\"週\":{\"刊\":1},\"刊\":{\"少\":1},\"サンデー\":{\"で\":1},\"『\":{\"絶\":1},\"絶\":{\"対\":3},\"対\":{\"可\":1,\")\":1,\"象\":2,\"に\":1},\"可\":{\"憐\":1,\"愛\":1,\"能\":1},\"憐\":{\"チルドレン』\":1},\"チルドレン』\":{\"連\":1},\"載\":{\"中\":1,\"禁\":1,\"は\":1},\"。TVアニメ『THE\":{\"UNLIMITED\":1},\"UNLIMITED\":{\"兵\":1},\"式\":{\"サイト＞http://t.co/jVqBoBEc\":1,\"bot\":1,\"アカウント\":4,\"野\":2,\"RT\":1,\"Bot　マセレン\":1},\"サイト＞http://t.co/jVqBoBEc\":{},\"普\":{\"通\":1,\"段\":1},\"通\":{\"の\":1,\"过\":2},\"い、\":{\"ち\":1,\"怖\":1},\"ょ\":{\"っ\":1,\"う。\":3,\"う\":1},\"変\":{\"態\":1,\"え\":1},\"態\":{\"チック\":1,\"を\":1,\"をツイート\":1},\"チック\":{\"な\":1},\"笑\":{\"える\":2,\"っ\":2,\"えるミサワ\":1,\"。　\":1},\"える\":{\"下\":1,\"程\":1,\"場\":1},\"\\r\\nお\":{\"も\":5},\"ろ\":{\"か\":4,\"う\":1},\"ぐ\":{\"18\":1,\"に\":1,\"るり\":1,\"役\":1,\"、Furniture）\":1},\"えるフレーズ\":{\"や\":1},\"簡\":{\"単\":1},\"単\":{\"な\":1},\"会\":{\"話\":2,\"に\":1,\"い\":1,\"变\":1},\"話\":{\"を\":1,\"題\":1,\"し\":1},\"づ\":{\"つ\":1},\"練\":{\"習\":1},\"習\":{\"し\":1,\"性\":1},\"よう☆\":{\"\\r\\n\":1},\"イザ\":{\"と\":1},\"いう\":{\"時\":1,\"ち\":1,\"理\":1},\"困\":{\"っ\":1},\"役\":{\"に\":2,\"立\":1},\"立\":{\"つ\":3},\"ハンドサイン\":{\"の\":1},\"オンパレード\":{\"で\":1},\"イイ\":{\"女\":1},\"秘\":{\"密\":1},\"密\":{\"を\":1},\"いい\":{\"な\":1,\"こ\":1},\"surprise\":{\"even\":1},\"even\":{\"my\":1},\"my\":{\"self\":1},\"self\":{},\"解\":{\"け\":1,\"説\":1,\"す\":1,\"で\":1},\"題\":{\"を\":1,\"の\":2,\"は\":1},\"Gパング\":{\"の\":1},\"A\":{\"型\":1},\"型\":{\"K\":1,\"の\":2},\"K\":{\"月\":1},\"克\":{\"己\":1},\"己\":{\"中\":1,\"満\":1},\"尉\":{\"の\":1},\"七\":{\"巻\":1},\"巻\":{\"と\":1,\"が\":1},\"八\":{\"巻\":1},\"台\":{\"詞\":3},\"詞\":{\"を\":1,\"追\":1,\"や\":1},\"4/18.\":{\"台\":1},\"追\":{\"加\":3,\"求\":2},\"加\":{\"し\":2,\"中\":1},\"現\":{\"在\":4,\"は\":1},\"在\":{\"試\":1,\"軽\":1,\"活\":1,\"BOT\":1},\"試\":{\"運\":1,\"験\":1},\"運\":{\"転\":1},\"転\":{\"中\":1,\"載\":2},\"挨\":{\"拶\":1},\"拶\":{\"だ\":1},\"反\":{\"応\":1,\"对\":1},\"。/\":{\"追\":1},\"何\":{\"お\":1,\"か\":1,\"を\":1,\"国\":1},\"所\":{\"が\":1},\"らDM\":{\"や\":1},\"リプライ\":{\"で\":1},\"/フォロー\":{\"返\":1},\"ww　い\":{\"や\":1},\"れるイラストを\":{\"紹\":1},\"よう～♪\":{\"\\r\\n「\":1},\"\\r\\n「\":{\"非\":3,\"こ\":1},\"いネタ\":{\"や\":1},\"、あるあるを\":{\"見\":2},\"、BL～\":{\"萌\":1},\"萌\":{\"えキュン\":1},\"えキュン\":{\"系\":1},\"同\":{\"じ\":1,\"業\":1},\"境\":{\"遇\":1},\"遇\":{\"の\":1},\"、わ\":{\"か\":2},\"らえる\":{\"と\":1},\"☆\":{\"\\r\\n\":1,\"\\r\\nタイプ\":1},\"来\":{\"る\":1},\"術\":{\"!!\":1},\"!!\":{\"見\":1,\"応\":1},\"い♪\":{\"\\r\\n\":1},\"ラテアートを、\":{\"と\":1},\"探\":{\"し\":5,\"そ\":1},\"\\r\\nスゴイ\":{\"と\":1},\"ジャニーズ\":{\"の\":1},\"カッコイイ\":{\"画\":1},\"ろエピソード\":{\"な\":1},\"\\r\\nジャニーズ\":{\"好\":1},\"是\":{\"非\":6,\"人\":1,\"“\":1,\"精\":1,\"意\":1},\"＆\":{\"フォローお\":5,\"フォローを、お\":2,\"フォロー\":1},\"＼\":{\"も\":1},\"歳\":{\"“Only\":1},\"“Only\":{\"One”\":1},\"One”\":{\"に\":1},\"うLINE\":{\"で\":1},\"ウザ\":{\"す\":1},\"ぎ\":{\"て\":2,\"る\":1,\"るアニメ\":1},\"えるミサワ\":{\"的\":1},\"名\":{\"言\":1,\"人\":1,\"場\":1},\"ろミサワ\":{\"画\":1},\"\\r\\nミサワを\":{\"知\":1},\"りツボ\":{\"に\":1},\"ハマ\":{\"っ\":1},\"\\r\\nウザいｗ\":{\"と\":1},\"昔\":{\"は\":1},\"若\":{\"か\":1},\"想\":{\"像\":1,\"いを、\":1,\"力\":1,\"の\":1,\"を\":1},\"い、あ\":{\"の\":1},\"THE\":{\"SECOND/\":1},\"SECOND/\":{\"劇\":1},\"団\":{\"EXILE/EXILE/\":1},\"EXILE/EXILE/\":{\"二\":1},\"JSB\":{\"☞KENCHI.AKIRA.\":1},\"☞KENCHI.AKIRA.\":{\"青\":1},\"青\":{\"柳\":1},\"柳\":{\"翔\":1},\"翔\":{\".\":1},\".\":{\"小\":1,\"石\":1,\"た\":1,\"戸\":1},\"隼\":{\".\":1},\"石\":{\"井\":1},\"井\":{\"杏\":1},\"杏\":{\"奈\":1},\"奈\":{\"☜\":1},\"☜\":{\"Big\":1},\"Big\":{\"Love\":1},\"Love\":{\"♡\":1},\"Respect\":{\".....\":1},\".....\":{\"✍\":1},\"✍\":{\"MATSU\":1},\"MATSU\":{\"Origin✧\":1},\"Origin✧\":{\".\":1},\"''\":{\"い\":1,\"け\":1},\"んTEAM\":{\"NACS\":1},\"NACS\":{\"安\":1},\"安\":{\"田\":1},\"田\":{\".\":1,\"舞\":1},\"戸\":{\"次\":1},\"次\":{\"Liebe\":1},\"Liebe\":{\"!\":1},\"!\":{},\"Yahooオークション\":{\"の\":1},\"デジカメカテゴリ\":{\"か\":1},\"商\":{\"品\":1},\"品\":{\"を\":1},\"抽\":{\"出\":1},\"出\":{\"す\":1,\"場\":1,\"会\":1},\"るボット\":{\"で\":1},\"世\":{\"の\":1,\"界\":4},\"いスゴイ\":{\"記\":1},\"録\":{\"が\":1,\"を\":1},\"あるん\":{\"で\":1},\"ギネス\":{\"世\":1},\"界\":{\"記\":1,\"の\":1,\"を\":1,\"的\":1},\"友\":{\"達\":1},\"ww\":{\"\\r\\nヤバイ\":1},\"\\r\\nヤバイ\":{\"と\":1},\"ヤー・チャイカ。\":{\"紫\":1},\"紫\":{\"宝\":1},\"宝\":{\"勢\":1},\"勢\":{\"の\":1},\"末\":{\"席\":1},\"席\":{\"く\":1},\"らい\":{\"で\":1},\"QMA\":{\"や\":1},\"\\r\\n9/13（\":{\"土\":1},\"土\":{\"）「\":1},\"）「\":{\"九\":1},\"九\":{\"州\":1},\"州\":{\"杯\":1},\"宜\":{\"し\":1},\"！キーワード\":{\"は\":1},\"、トップ、\":{\"行\":1},\"う。」\":{\"\\r\\nmore\":1},\"\\r\\nmore\":{\"→\":1},\"→\":{\"http://t.co/ezuHyjF4Qy\":1,\"9/23-28\":1},\"http://t.co/ezuHyjF4Qy\":{\"\\r\\n【\":1},\"\\r\\n【\":{\"旅\":1},\"旅\":{\"の\":1},\"予\":{\"定\":1},\"定\":{\"】9/20-22\":1},\"】9/20-22\":{\"関\":1},\"9/23-28\":{\"北\":1},\"北\":{\"海\":1},\"海\":{\"道\":1},\"るり\":{},\"庫\":{\"県\":1},\"県\":{\"で\":1},\"開\":{\"催\":1},\"れる「\":{\"も\":1},\"甲\":{\"子\":1},\"園\":{\"」\":1},\"国\":{\"高\":1,\"的\":1,\"家\":1},\"軟\":{\"式\":2},\"権\":{\"大\":1},\"南\":{\"関\":1},\"東\":{\"ブロック\":1,\"方\":2},\"ブロック\":{\"か\":1},\"三\":{\"浦\":1},\"浦\":{\"学\":1},\"苑\":{\"軟\":1},\"い、いろん\":{\"な\":1},\"キャラ\":{\"が\":1},\"スマホ\":{\"に\":2},\"閉\":{\"じ\":1},\"\\r\\nあ\":{\"な\":1},\"マッチ\":{\"す\":1},\"危\":{\"険\":1},\"険\":{\"な\":1},\"守\":{\"り\":1,\"”\":1},\"う。\":{\"役\":1,\"私\":1,\"\\r\\n\":2},\"デイジー\":{\"の\":1},\"いを、\":{\"代\":1},\"わり\":{\"に\":1},\"\\r\\nデイジー\":{\"の\":1},\"グッズ\":{\"も\":1},\"ｗ\":{\"\\r\\n\":1},\"私\":{\"が\":1,\"の\":1,\"に\":1,\"っ\":1,\"も\":1,\"目\":1,\"と\":1},\"聞\":{\"い\":1},\"残\":{\"っ\":1,\"る、ドラマ\":1},\"エピソードをお\":{\"届\":1},\"へ\":{\"届\":1},\"絡\":{\"ん\":1},\"うれ\":{\"し\":1},\"イラスト\":{\"大\":1},\"！（≧∇≦）\":{\"BF(\":1},\"BF(\":{\"仮\":1},\"仮\":{\"）\":1},\"）\":{\"逢\":1},\"逢\":{\"坂\":1},\"坂\":{\"紘\":1},\"紘\":{\"夢\":1},\"熱\":{\"で\":1},\"マンガ\":{\"も\":1},\"望\":{\"の\":1},\"を。\":{\"雑\":1},\"食\":{\"♡\":1,\"べ\":2},\"ツイプロ。アイコン\":{\"は\":1},\"ろり\":{\"ち\":1},\"よ☆～（ゝ。∂）\":{},\"段\":{\"は\":1},\"い「お・ん・\":{\"な\":1},\"建\":{\"前\":1,\"築\":2,\"”、“\":1},\"前\":{\"と\":1,\"向\":1},\"!?\":{\"\\r\\nわ\":1,\"\\r\\nお\":1},\"\\r\\nわ\":{\"か\":2},\"コレ\":{\"色\":1,\"も\":1},\"色\":{\"鉛\":1},\"鉛\":{\"筆\":1},\"筆\":{\"な\":1},\"～？\":{\"\\r\\n\":1},\"違\":{\"える\":1},\"程\":{\"の\":1},\"リアリティを\":{\"御\":1},\"御\":{\"覧\":1,\"用\":1},\"覧\":{\"く\":1,\"：\":1},\"政\":{\"書\":1,\"法\":1},\"士\":{\"の\":1},\"験\":{\"問\":1,\"を、シェア\":1},\"過\":{\"去\":1},\"去\":{\"問\":1},\"）をランダム\":{\"に\":1},\"随\":{\"時\":2},\"基\":{\"本\":3,\"準\":1},\"。※140\":{\"字\":1},\"字\":{\"制\":1,\"数\":1},\"制\":{\"限\":1},\"限\":{\"の\":1},\"都\":{\"合\":1,\"市\":1},\"文\":{\"字\":1},\"能\":{\"で\":1,\"一\":1,\"」\":1},\"あれ\":{\"ば\":1},\"…。\":{},\"ら、\":{\"そ\":1,\"是\":3},\"領\":{\"域\":1},\"域\":{\"に\":1},\"！？\":{\"\\r\\n\":1},\"～♪\":{\"\\r\\n\":2},\"、あ\":{\"の\":1,\"な\":1},\"裏\":{\"側\":1},\"側\":{\"を\":1},\"作\":{\"ろう\":1,\"っ\":1,\"り\":2},\"ろう\":{\"と\":1},\"【\":{\"無\":1},\"断\":{\"転\":1,\"り！\":1},\"禁\":{\"止\":3},\"止\":{\"･コピペ\":1,\"・\":1,\"】【\":1},\"･コピペ\":{\"禁\":1},\"】【\":{\"必\":1},\"！】⇒\":{\"http://t.co/nuUvfUVD\":1},\"http://t.co/nuUvfUVD\":{\"今\":1},\"活\":{\"動\":1},\"YUNHO＆CHANGMIN\":{\"の\":1},\"!!(^_-)-☆\":{\"※\":1},\"※\":{\"東\":1},\"及\":{\"び\":2},\"YUNHO＆CHANGMINを\":{\"応\":1},\"鍵\":{\"付\":1},\"付\":{\"ユーザー\":1,\"け\":2},\"ユーザー\":{\"の\":1},\"り！\":{},\"歌\":{\"う、\":1},\"う、\":{\"演\":1,\"\\r\\n\":1,\"美\":1},\"、ネットワークエンジニア、ライター、プログラマ、\":{\"翻\":1},\"翻\":{\"訳\":1},\"、シルバーアクセサリ、……\":{\"何\":1},\"りアナ\":{\"雪\":1},\"雪\":{\"が\":1},\"よ\":{\"ね\":1,\"っ\":1},\"hack\":{\"と\":1},\"いうバンド\":{\"で\":1},\"、ギターを\":{\"弾\":1},\"弾\":{\"い\":1},\"モンハン\":{\"と\":1},\"ポケモン\":{\"が\":1},\"\\nSPRING\":{\"WATER\":1},\"WATER\":{\"リードギター(ヘルプ)\":1},\"リードギター(ヘルプ)\":{\"\\nROCK\":1},\"\\nROCK\":{\"OUT\":1},\"OUT\":{\"レギュラーDJ\":1},\"レギュラーDJ\":{},\"耳\":{\"を\":1},\"疑\":{\"う\":1},\"性\":{\"の\":2,\"♥\":1,\"像\":1,\"に\":1,\"を\":1},\"壊\":{\"し\":1},\"ディープ\":{\"な\":1},\"い☆\":{\"\\r\\nお\":1},\"ろい\":{\"と\":1},\"♥\":{\"ほ\":1,\"そ\":1},\"ら!?\":{\"\\r\\n「い\":1},\"\\r\\n「い\":{\"た\":1},\"らいい\":{\"の\":1},\"ぁ」\":{\"っ\":1},\"をを、\":{\"私\":1},\"６\":{\"秒\":1},\"秒\":{\"動\":1},\"ツッコん\":{\"で\":1},\"オンパレード！\":{\"\\r\\nお\":1},\"⁽⁽٩(\":{\"ᐖ\":1},\"ᐖ\":{\")۶⁾⁾\":1},\")۶⁾⁾\":{\"❤︎\":1},\"❤︎\":{\"武\":1,\"₍₍٩(\":1},\"舞\":{\"彩\":1},\"彩\":{\"❤︎\":1},\"₍₍٩(\":{\"ᐛ\":1},\"ᐛ\":{\")۶₎₎\":1},\")۶₎₎\":{},\"、フォローあり\":{\"が\":1},\"う…。@ringo_BDFFLOVE\":{\"←\":1},\"←\":{\"は\":1},\"妹\":{\"で\":1},\"々、\":{\"会\":1},\"。「\":{\"現\":1},\"BOT\":{\"で\":1},\"、BDFF\":{\"の\":1},\"よ！」\":{\"夜\":1},\"夜\":{\"は\":1},\"滅\":{\"　「BDFFプレイ\":1},\"　「BDFFプレイ\":{\"中\":1},\"、ツイプロ\":{\"み\":1},\"い！(\":{\"絶\":1},\")\":{},\"ProjectDIVA\":{\"の\":1},\"モジュール・ストレンジダーク×\":{\"鏡\":1},\"鏡\":{\"音\":1},\"リンFutureStyle\":{\"の\":1},\"満\":{\"足\":1},\"足\":{\"非\":1},\"Bot　マセレン\":{\"仕\":1},\"仕\":{\"様\":1},\"様\":{\"。CP\":1,\"に\":1,\"を\":1},\"。CP\":{\"要\":1},\"美\":{\"味\":3,\"女\":1},\"スイーツ\":{\"っ\":1,\"に\":1},\"オモシロ\":{\"く\":1},\"えるランキングを\":{\"探\":1},\"スニーカー\":{\"好\":1},\"仲\":{\"間\":2},\"ろう♪\":{\"\\r\\n\":1},\"cambiando\":{\"la\":1},\"la\":{\"vida\":1},\"vida\":{\"de\":1},\"de\":{\"las\":1},\"las\":{\"personas.\":1},\"personas.\":{},\"異\":{\"性\":1},\"然\":{\"的\":1},\"モテるよう\":{\"に\":1},\"る！？　\":{\"相\":1},\"・・・●●」　いい\":{\"内\":1},\"「おお～\":{\"っ\":2},\"！いい\":{\"ね\":1},\"～」\":{\"っ\":1},\"\\r\\nタイプ\":{\"だ\":1},\"あるある☆\":{\"\\r\\n\":1},\"る～\":{\"っ\":1},\"われるよう\":{\"な\":1},\"をツイート\":{\"し\":1},\"者\":{\"に\":1,\"様\":1},\"オシャレ\":{\"か\":1},\"わいい♥モテ\":{\"度\":1},\"UP\":{\"の\":1},\"アイテムを\":{\"見\":2},\"ぞ\":{\"れ\":1},\"\\r\\n「え\":{\"っ\":1},\"　マジ\":{\"で\":1},\"!?」\":{\"と\":1},\"驚\":{\"く\":1},\"よう\":{\"な\":1},\"ビシバシ\":{\"伝\":1},\"伝\":{\"わ\":1,\"説\":1,\"え\":1},\"ヒント\":{\"に\":1},\"るよう\":{\"な\":1},\"究\":{\"極\":1},\"極\":{\"の\":1},\"ONE\":{\"PIECE\":1},\"PIECE\":{\"愛\":1},\"２３\":{\"ち\":1},\"い(\":{\"歴\":1},\"歴\":{\"１４\":1},\"１４\":{\"年\":1},\")ゾロ\":{\"様\":1},\"途\":{\"だ\":1},\"ロー、\":{\"こ\":1},\"ろー。ロビン\":{\"ち\":1},\"いい。ルフィ\":{\"は\":1},\"件\":{\"に\":1},\"。ゾロビン、ローロビ、ルロビ♡usj、\":{\"声\":1},\"ん、コナン、\":{\"進\":1},\"、クレ\":{\"し\":1},\"ん、H\":{\"x\":1},\"x\":{\"H\":1},\"H\":{\"も\":1},\"♩\":{},\"豊\":{\"富\":1},\"富\":{\"で\":1},\"ステキ\":{\"な\":1},\"恋\":{\"愛\":2},\"経\":{\"験\":1},\"を、シェア\":{\"し\":1},\"誰\":{\"に\":1},\"憶\":{\"に\":1},\"る、ドラマ\":{\"の\":1},\"ストーリーを、\":{\"も\":1},\"あい\":{\"た\":1},\"る！」\":{\"と\":1},\"「あ～\":{\"懐\":1},\"懐\":{\"か\":1},\"い」\":{\"と\":1},\"ケーキを\":{\"探\":1},\"求\":{\"め\":1,\"“\":1,\"本\":1},\"、あれ\":{\"も\":1},\"アディダス\":{\"の\":1},\"らえ\":{\"た\":1},\"ららRT\":{\"&\":1},\"わいいペットを\":{\"見\":1},\"緒\":{\"に\":1},\"？\":{\"か\":1},\"～！\":{\"知\":1},\"いれ\":{\"ば\":1},\"マメ\":{\"知\":1},\"識\":{\"をお\":1},\"住\":{\"む\":1},\"む\":{\"部\":1},\"い♪　\":{\"\\r\\n\":1},\"インテリアを、\":{\"日\":1},\"w　\":{\"\\r\\nいい\":1},\"いー\":{\"と\":1},\"闻\":{\"，\":1,\"。\":1},\"，\":{\"世\":1,\"当\":1,\"人\":1,\"反\":1,\"也\":2,\"本\":1},\"LDHファン\":{\"は\":1},\"員\":{\"仲\":1},\"怖\":{\"す\":1},\"るアニメ\":{\"の\":1},\"市\":{\"伝\":1},\"\\r\\n「え～\":{\"知\":1},\"よww]」\":{\"っ\":1},\"サマーエルフ\":{\"で\":1},\"、りい\":{\"こ\":1},\"。えるお\":{\"く\":1},\"んラブ\":{\"で\":1},\"ぼ\":{\"し\":1},\"ゅ\":{\"〜〜(\":1},\"〜〜(\":{\"っ\":1},\"˘ω˘c\":{\")＊\":1},\")＊\":{\"日\":1},\"〜\":{},\"具\":{\"（\":1,\"の\":1,\"類\":2,\"は\":1},\"、Furniture）\":{\"は\":1},\"財\":{\"道\":1},\"据\":{\"え\":1},\"置\":{\"い\":1,\"か\":1},\"利\":{\"用\":1},\"比\":{\"較\":2},\"較\":{\"的\":2},\"類\":{\"、\":1,\"を\":1},\"築\":{\"基\":1,\"確\":1},\"準\":{\"法\":1},\"完\":{\"了\":1},\"検\":{\"査\":1},\"査\":{\"の\":1},\"象\":{\"と\":1,\"外\":1,\"。\":1},\"君\":{\"の\":1},\"瞳\":{\"に\":1},\"僕\":{\"に\":1},\"乾\":{\"杯\":1},\"ぬ\":{\"が\":1},\"仏\":{\"な\":1},\"わるい\":{\"こ\":1},\"经\":{\"历\":1},\"历\":{\"了\":1},\"怎\":{\"样\":1},\"样\":{\"的\":1},\"曲\":{\"折\":1},\"折\":{\"才\":1},\"才\":{\"从\":1},\"从\":{\"追\":1},\"“\":{\"一\":2,\"过\":1,\"基\":1,\"封\":1},\"过\":{\"”\":1,\"半\":1,\"”，\":1},\"”\":{\"发\":1,\"甚\":1,\"的\":2},\"发\":{\"展\":1},\"展\":{\"到\":1},\"到\":{\"今\":1,\"对\":1},\"天\":{\"人\":1},\"们\":{\"接\":1,\"认\":1},\"接\":{\"受\":1},\"半\":{\"数\":1},\"”，\":{\"正\":1},\"正\":{\"是\":1,\"确\":1},\"认\":{\"识\":1},\"识\":{\"到\":1},\"对\":{\"“\":1,\"象\":1,\"网\":1},\"甚\":{\"至\":1},\"至\":{\"是\":1},\"身\":{\"就\":1},\"就\":{\"会\":1},\"变\":{\"成\":1},\"种\":{\"独\":1},\"独\":{\"裁\":1},\"裁\":{\"。\":1},\"被\":{\"人\":1},\"指\":{\"责\":1},\"责\":{\"“\":1},\"封\":{\"建\":1,\"锁\":1},\"”、“\":{\"落\":1,\"保\":1},\"落\":{\"后\":1},\"后\":{\"”、“\":1},\"保\":{\"守\":1},\"红\":{\"卫\":1},\"卫\":{\"兵\":1},\"攻\":{\"击\":1},\"击\":{\"对\":1},\"于\":{\"言\":1},\"论\":{\"自\":1,\"不\":1},\"权\":{\"；\":1},\"；\":{\"倡\":1},\"倡\":{\"导\":1},\"导\":{\"资\":1},\"资\":{\"讯\":1},\"讯\":{\"公\":1},\"开\":{\"，\":1},\"网\":{\"络\":1},\"络\":{\"封\":1},\"锁\":{\"。\":1},\"既\":{\"不\":1},\"不\":{\"是\":2,\"代\":1,\"标\":1},\"英\":{\"分\":1},\"也\":{\"不\":2},\"见\":{\"领\":1},\"领\":{\"袖\":1},\"袖\":{\"，\":1},\"任\":{\"何\":1},\"派\":{\"和\":1},\"和\":{\"组\":1,\"正\":1},\"组\":{\"织\":1},\"织\":{\"，\":1},\"标\":{\"榜\":1},\"榜\":{\"伟\":1},\"伟\":{\"大\":1},\"光\":{\"荣\":1},\"荣\":{\"和\":1},\"确\":{\"。\":1},\"ニコ\":{\"動\":1},\"踊\":{\"り\":1},\"嬉\":{\"し\":1},\"ざ\":{\"い\":1},\"!!　\":{\"ぽ\":1},\"ぽ\":{\"っ\":1},\"向\":{\"き\":1},\"頑\":{\"張\":1},\"張\":{\"る\":1},\"虫\":{\"ペダル\":1},\"ペダル\":{\"が\":1},\"！【お\":{\"返\":1},\"】り\":{\"ぷ\":1},\"ぷ\":{\"(\":1},\")”○”　DM\":{\"(\":1},\"業\":{\"者\":1},\"除\":{\"い\":1},\")”×”　\":{\"動\":1},\"ブログ→http://t.co/8E91tqoeKX　　\":{}}"
    ) as Record<string, Record<string, number>>;
}
/* eslint-enable */
