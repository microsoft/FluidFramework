import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import {
    getRandomEnglishString,
    getRandomNumberString,
    getRandomStringByCharCode, getSizeInBytes,
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
export function generateTwitterJsonByByteSize(sizeInBytes: number, includeUnicode: boolean, allowOversize: boolean,
    seed = 1) {
    const random = makeRandom(seed);

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
        const twitterStatus = generateTwitterStatus("standard", includeUnicode, random);
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
export function generateTwitterJsonByNumStatuses(numStatuses: number, includeUnicode: boolean, seed = 1) {
    const random = makeRandom(seed);

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
        twitterJson.statuses.push(generateTwitterStatus("standard", includeUnicode, random));
    }

    return twitterJson;
}

/* eslint-disable no-useless-escape */
function generateTwitterStatus(type: "standard" | "retweet", includeUnicode: boolean, random: IRandom) {
    // id is always an 18 digit number
    const statusIdString = getRandomNumberString(random, 18, 18);
    const retweetCount = Math.floor(random.integer(0, 99999));
    const favoriteCount = Math.floor(random.integer(0, 99999));
    const twitterUser = generateTwitterUser(includeUnicode, random);
    const shouldAddHashtagEntity = random.bool(0.5);
    const shouldAddUrlEntity = random.bool(0.5);
    const shouldAddUserMentionsEntity = random.bool(0.5);
    const shouldAddMediaEntity = random.bool(0.5);

    const twitterStatus: any = {
        metadata: {
            result_type: "recent",
            iso_language_code: "ja",
        },
        created_at: getRandomDateString(random, new Date("2005-01-01"), new Date("2022-01-01")),
        id: Number(statusIdString),
        id_str: `${statusIdString}`,
        text: includeUnicode ? getRandomKanjiString(random, 1, 200) : getRandomEnglishString(random, false, 1, 200),
        // source can have unicode nested in it
        source: `<a href=\"https://twitter.com/${twitterUser.screen_name}\" rel=\"nofollow\">
            ${includeUnicode ? getRandomKanjiString(random, 1, 30) : getRandomEnglishString(random, false, 1, 30)}</a>`,
        truncated: true, // no examples found where truncated was false
        user: twitterUser,
        // could not find an example of non null value for these 4 values (geo, coordinaes, place, contributors)
        geo: null,
        coordinates: null,
        place: null,
        contributors: null,
        possibly_sensitive: random.bool(0.5),
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
        const inReplyToStatusId = random.bool(0.5) ? getRandomNumberString(random, 18, 18) : null;
        const inReplyToUserId = random.bool(0.5) ? getRandomNumberString(random, 10, 10) : null;
        twitterStatus.in_reply_to_status_id = inReplyToStatusId !== null ? Number(inReplyToStatusId) : null;
        twitterStatus.in_reply_to_status_id_str = inReplyToStatusId !== null ? inReplyToStatusId : null;
        twitterStatus.in_reply_to_user_id = inReplyToUserId !== null ? Number(inReplyToUserId) : null;
        twitterStatus.in_reply_to_user_id_str = inReplyToUserId !== null ? inReplyToUserId : null;
        twitterStatus.in_reply_to_screen_name = inReplyToUserId !== null ?
            getRandomEnglishString(random, false, 6, 30) : null;
        twitterStatus.retweeted_status = generateTwitterStatus("retweet", includeUnicode, random);
    }

    if (shouldAddHashtagEntity) {
        twitterStatus.entities.hashtags.push({
            text: getRandomKanjiString(random, 1, 30),
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
            name: getRandomKanjiString(random, 1, 30),
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
        const shouldAddSourceIdData = random.bool(0.5);
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

function generateTwitterUser(includeUnicode: boolean, random: IRandom): TwitterUser {
    const userId = getRandomNumberString(random, 10, 10);
    const shouldAddUrlUrlsEntity = random.bool(0.5);
    const shouldAddDescriptionUrlsEntity = random.bool(0.5);
    const shouldAddUtcOffsetAndtimezone = random.bool(0.5);
    const user: TwitterUser = {
        id: Number(userId),
        id_str: userId,
        name: includeUnicode ? getRandomKanjiString(random, 1, 30) : getRandomEnglishString(random, false, 1, 30),
        // screen names do not include unicode characters
        screen_name: getRandomEnglishString(random, false, 6, 30),
        location: "",
        description: includeUnicode ?
            getRandomKanjiString(random, 1, 200) : getRandomEnglishString(random, false, 1, 200),
        url: null,
        entities: {
            // This always appears on a user, even if its empty.
            description: {
                urls: [],
            },
        },
        protected: false,
        followers_count: 289,
        friends_count: 1156,
        listed_count: 2,
        created_at: getRandomDateString(random, new Date("2005-01-01"), new Date("2022-01-01")),
        favourites_count: 0,
        utc_offset: shouldAddUtcOffsetAndtimezone ? 32400 : null,
        time_zone: shouldAddUtcOffsetAndtimezone ? "Tokyo" : null,
        geo_enabled: random.bool(0.5),
        verified: random.bool(0.5),
        statuses_count: Math.floor(random.integer(0, 99999)),
        lang: "ja",
        contributors_enabled: random.bool(0.5),
        is_translator: random.bool(0.5),
        is_translation_enabled: random.bool(0.5),
        profile_background_color: getRandomEnglishString(random, true, 6, 6),
        profile_background_image_url: "http://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_image_url_https: "https://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_tile: random.bool(0.5),
        profile_image_url: "http://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_image_url_https: "https://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_banner_url: "https://pbs.twimg.com/profile_banners/2699365116/1406936481",
        profile_link_color: getRandomEnglishString(random, true, 6, 6),
        profile_sidebar_border_color: getRandomEnglishString(random, true, 6, 6),
        profile_sidebar_fill_color: getRandomEnglishString(random, true, 6, 6),
        profile_text_color: getRandomEnglishString(random, true, 6, 6),
        profile_use_background_image: random.bool(0.5),
        default_profile: random.bool(0.5),
        default_profile_image: random.bool(0.5),
        following: random.bool(0.5),
        follow_request_sent: random.bool(0.5),
        notifications: random.bool(0.5),
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

// This includes common and uncommon kanji characters
// but not rare kanji characters (3400 - 4dbf) as none were found in the source twitter json.
function getRandomKanjiString(random = makeRandom(), minLen: number, maxLen: number) {
    return getRandomStringByCharCode(random, minLen, maxLen, 0x4e00, 0x9faf);
}

// This is specifically formatted like the twitter json dates
// (<3-letter-weekday> MMM DD HH:MM:SS <4-digit-TimezoneOffset> YYYY)
function getRandomDateString(random = makeRandom(), start: Date, end: Date) {
    const dateS = new Date(start.getTime() + random.real() * (end.getTime() - start.getTime())).toString();
    return `${dateS.substring(0, 10)} ${dateS.substring(16, 24)} ` +
        `${dateS.substring(28, 33)} ${dateS.substring(11, 15)}`;
}

export function isJapanese(ch: string) {
    // Japanese hiragana Alphabet
    return (ch >= "\u304B" && ch <= "\u3087"
    // Japanese Katakana Alphabet
    || ch >= "\u30F3" && ch <= "\u30AA"
    // Japanese Kanji Alphabet (CJK Unified Ideographs)
    || ch >= "\u4E00" && ch <= "\u9FBF");
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

/**
 * Japanese is not space separated but individual characters are counted as words here words.
 * We count a series of english charaters, numbers, symbols or escape characters without spaces in between as a word.
 *
 * 1. we will first space separate the text,
 * 2. we will iterate over each character in each space separated word.
 * 2a. If the char is a Japanese it will be counted as a complete word.
 * 2b. If the characters are alpha latin, escapes or line breaks we will count it as part of a word,
 *  adding each next chars until we get to either a Japanese character or a space.
 */
/* eslint-disable @typescript-eslint/ban-ts-comment */

export function parseTwitterJsonIntoSentences(twitterJson: TwitterJson, fieldName: string) {
    const sentences: string[][] = [];
    twitterJson.statuses.forEach((status) => {
        const sentenceWords: string[] = [];
        // @ts-ignore: ideally we would type all the fieldName options
        // but for this testing utility helper function its unecessary.
        const spaceSeparatedWords: string[] = status[`${fieldName}`].split(" ");
        spaceSeparatedWords.forEach((potentialWord) => {
            const innerWords: string[] = [];
            let previousChar: string | null = null;
            let currentWord = "";
            for (let i = 0; i < potentialWord.length; i++) {
                const currentChar = potentialWord.charAt(i);
                if (isEscapeChar(currentChar)) {
                    if (previousChar && !isEscapeChar(previousChar)) {
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

        sentences.push(sentenceWords);
    });

    return sentences;
}

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
                if (isEscapeChar(currentChar)) {
                    if (previousChar && !isEscapeChar(previousChar)) {
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
/* eslint-enable */

/* eslint-disable max-len */
export function getTwitterJsonTextFieldMarkovChain() {
    return JSON.parse(
        "{\"1\":{\"日\":2},\"8\":{\"月\":2},\"9\":{\"月\":2},\"13\":{\"時\":1},\"30\":{\"分\":1},\"31\":{\"日\":3},\"480\":{\"匹\":1},\"MARKOV_SENTENCE_BEGIN_KEY_01$#@%^#\":{\"RT\":73,\"@longhairxMIURA\":1,\"【\":3,\"お\":1,\"@ran_kirazuki\":1,\"一\":1,\"今\":1,\"@kohecyan3\":1,\"第\":1,\"レッドクリフ\":1,\"す\":1,\"【H15-9-4】\":1,\"四\":2,\"@Take3carnifex\":1,\"爆\":1,\"@nasan_arai\":1,\"\\\"ソードマスター\\\"\":1,\"闇\":1,\"\\\"@BelloTexto:\":1,\"@kaoritoxx\":1,\"@itsukibot_\":1,\"天\":1,\"@vesperia1985\":1,\"【マイリスト】【\":1},\"@aym0566x\":{\"\\n\\n\":1},\"\\n\\n\":{\"名\":1},\"名\":{\"前\":3,\"貪\":1},\"前\":{\":\":2,\"田\":1,\"は\":1,\"へ\":116,\"→\":1,\"日\":1},\":\":{\"前\":1,\"な\":1,\"と\":1,\"照\":1,\"上\":1,\"ず\":1,\"過\":1,\"大\":1,\"\\n\":4,\"\\n#RT\":1,\"　　\":2},\"田\":{\"あ\":1,\"舎\":1,\"新\":1,\"准\":1},\"あ\":{\"ゆ\":1,\"ふ\":1,\"っ\":1},\"ゆ\":{\"み\":1},\"み\":{\"\":1,\"合\":1,\"て\":1,\"る\":1,\"た\":2,\"に\":1},\"\":{\"\\n\":6,\"\\n　※\":1,\"\\nhttp://t.co/jRWJt8IrSB\":1,\"\\nhttp://t.co/fXIgRt4ffH\":1},\"\\n\":{\"第\":6,\"今\":6,\"好\":4,\"思\":1,\"一\":10,\"漢\":1,\"呼\":5,\"家\":2,\"最\":3,\"光\":1,\"名\":2,\"ち\":1,\"だ\":1,\"ど\":1,\"是\":1,\"先\":1,\"敵\":1,\"二\":1,\"執\":1,\"闇\":1,\"\\n#キンドル\":1},\"第\":{\"一\":14},\"一\":{\"印\":5,\"言\":5,\"生\":2,\"同\":2,\"ライカス\":1,\"本\":1,\"文\":1,\"地\":1,\"で\":2,\"関\":1,\"、\":2,\"つ\":1,\"に\":58,\"番\":58,\"雨\":1,\"を\":2,\"高\":1,\"踏\":1,\"や\":2,\"三\":1,\"眼\":2,\"科\":1,\"\":1,\"の\":1,\"原\":2,\"场\":2,\"大\":1,\"問\":1,\"答\":1,\"決\":1,\"師\":1,\"流\":1,\"号\":1,\"\\\"No\":6,\"稀\":1,\"水\":1,\"世\":1,\"名\":1,\"　\":1},\"印\":{\"象\":10},\"象\":{\":\":5,\"☞\":1,\"☞お\":1,\":バーバリー\":1,\"台\":2,\"→\":1,\"→れいら♡\":1},\"な\":{\"ん\":59,\"い\":10,\"と\":4,\"😘✨\":1,\"一\":1,\"い←\":1,\"お\":1,\"っ\":1,\"😳\":1,\"ら☞お\":1,\"い…\":1,\"ら\":2,\"る\":59,\"も\":58,\"〜\":1,\"「\":1,\"俺\":1,\"ら:\":1,\"い）クラスメイト\":1,\"さ\":1,\"い。→\":1,\"ー\":2,\"交\":1,\"の\":1,\"く\":1,\"情\":1},\"ん\":{\"か\":1,\"の\":2,\"で\":60,\"家\":1,\"\\n\":4,\"て\":58,\"ど\":58,\"大\":58,\"に\":2,\"張\":1,\"こ\":1,\"天\":1,\"好\":1,\"だ\":1,\"ね\":2,\"み\":1},\"か\":{\"怖\":1,\"ら\":3,\"な\":2,\"ら？！\":1,\"り\":58,\"い\":2,\"言\":1,\"わ\":1,\"っ\":3,\"ら２\":1,\"える\":1,\"く\":1,\"風\":1,\"…」\":2,\"せ\":1,\"ん\":1},\"怖\":{\"っ\":1},\"っ\":{\"！\":1,\"そ\":1,\"て\":14,\"た\":8,\"ぽ\":1,\"と\":1,\"…\":1},\"！\":{\"\\n\":3,\"http://t.co/FzTyFnt9xH”\":1,\"\\nhttp://t.co…\":1,\"一\":1,\"命\":1,\"毎\":1,\"在\":1},\"今\":{\"の\":5,\"こ\":1,\"日\":2,\"ま\":1,\"天\":2},\"の\":{\"印\":5,\"ダチ💖\":1,\"と\":1,\"スペース\":1,\"見\":1,\"DVD\":1,\"よう\":1,\"雨\":1,\"足\":1,\"指\":2,\"第\":1,\"年\":58,\"を\":58,\"で\":59,\"は\":58,\"場\":58,\"…\":58,\"申\":1,\"再\":1,\"皆\":1,\"カロリー\":1,\"た\":1,\"\":1,\"時\":1,\"自\":1,\"？\":1,\"調\":1,\"キャラ\":1,\"こ\":1,\"区\":1,\"拓\":1,\"際\":1,\"妨\":2,\"方\":1,\"ラ…\":1,\"秘\":1,\"敷\":1,\"排\":1,\"構\":1,\"ツメ\":1,\"甘\":1,\"センスを\":1,\"アスタリスク\":1,\"称\":1,\"剣\":1,\"師\":1,\"武\":1,\"差\":1,\"生\":1,\"俺\":1,\"ソーセージをペロペロ\":1,\"標\":2,\"０\":1,\"ゼロ）　\":1,\"新\":1,\"商\":1,\"現\":1,\"ランク\":1},\"と\":{\"りあえ\":1,\"こ\":6,\"な\":2,\"い\":1,\"小\":1,\"は\":2,\"う\":2,\"書\":58,\"いう\":174,\"、\":58,\"祈\":1,\"三\":1,\"か\":3,\"し\":1,\"思\":1,\"や\":1,\"女\":1,\"に\":1,\"生\":1,\"FB\":1,\"付\":1,\"る\":1,\"九\":1},\"りあえ\":{\"ず\":1},\"ず\":{\"キモい。\":1,\"バック\":1,\"る\":1},\"キモい。\":{\"噛\":1},\"噛\":{\"み\":1},\"合\":{\"わ\":1,\"唱\":1,\"（\":1,\"う\":1},\"わ\":{\"な\":1,\"\\n\":1},\"い\":{\"\\n\":3,\"出\":1,\"田\":1,\"と\":59,\"け\":1,\"ま\":5,\"た\":1,\"て\":120,\"く\":58,\"こ\":58,\"体\":2,\"か\":3,\"す\":1,\"し\":1,\"つ\":1,\"が\":1,\"夢\":1,\"手\":1,\"優\":3,\"事\":1,\"っ\":2},\"好\":{\"き\":5,\"ん\":1,\"】ペンタックス・デジタル\":1},\"き\":{\"な\":5,\"る？:あぁ……\":1,\"止\":1,\"て\":59,\"去\":58,\"そ\":1,\"た\":1,\"る？→\":1,\"〜(´･_･`)♡GEM\":1,\"合\":1},\"こ\":{\"ろ:\":2,\"😋✨✨\":1,\"と\":62,\"ろ\":1,\"の\":61,\"ろ:あ\":1,\"盛\":1,\"ち\":1,\"ろ→\":1},\"ろ:\":{\"ぶ\":1,\"\\n\":1},\"ぶ\":{\"す\":1,\"ん\":1},\"す\":{\"で\":1,\"ぎ\":1,\"が\":2,\"ん♪\":1,\"る\":6,\"！“@8CBR8:\":1,\"！\":3,\"アピール\":1,\"ご\":1,\"…」\":1,\"る(°_°)！\":1,\"よ…！！\":1},\"で\":{\"キモい\":1,\"き\":3,\"帰\":1,\"行\":1,\"Uターン\":1,\"500メートル\":1,\"進\":1,\"届\":1,\"いー\":1,\"は\":2,\"知\":58,\"し\":116,\"す\":3,\"、\":1,\"柏\":1,\"「\":1,\"キープ\":1,\"、「\":1,\"も\":2,\"面\":1,\"あり、\":1,\"ね\":1,\"な\":1},\"キモい\":{\"と\":1},\"😋✨✨\":{\"\\n\":1},\"思\":{\"い\":1,\"っ\":1,\"うよう\":1},\"出\":{\":んーーー、あり\":1,\"→\":1,\"来\":2,\"を\":1},\":んーーー、あり\":{\"す\":1},\"ぎ\":{\"😊❤️\":1},\"😊❤️\":{\"\\nLINE\":1},\"\\nLINE\":{\"交\":3},\"交\":{\"換\":3,\"際\":1},\"換\":{\"で\":2,\"☞\":1},\"る？:あぁ……\":{\"ご\":1},\"ご\":{\"め\":1,\"ざ\":3,\"ろ\":1,\"く\":1},\"め\":{\"ん✋\":1,\"る\":3,\"奉\":1,\"の\":58,\"に\":1,\"られ\":1},\"ん✋\":{\"\\nトプ\":1},\"\\nトプ\":{\"画\":2},\"画\":{\"を\":1,\"に\":1,\"　40\":1,\"パンフレット】　\":1},\"を\":{\"み\":1,\"頂\":1,\"持\":2,\"崇\":1,\"好\":1,\"置\":58,\"踊\":2,\"容\":1,\"抑\":1,\"送\":1,\"選\":2,\"利\":1,\"求\":1,\"認\":1,\"見\":1},\"て\":{\"480\":1,\":\":1,\"っ\":1,\"言\":1,\"帰\":1,\"迷\":1,\"姉\":1,\"るん\\\\(\":1,\"☞\":1,\"、\":177,\"いる\":60,\"い\":59,\"ま\":1,\"き\":2,\"下\":2,\"大\":1,\"る〜(*^^*)！\":1,\"み\":2,\"寝\":1,\"く\":1,\"（\":1,\"た\":1,\"ん\":1,\"道\":1,\"も\":1,\"る(｢･ω･)｢\":1,\"「\":1,\"歳\":1,\"おる。い\":1,\"る\":1,\"いい\":1,\"は\":1},\"照\":{\"れ\":1},\"れ\":{\"ま\":1,\"は\":3,\"方\":3,\"が\":1,\"か\":1,\"な\":1,\"で\":1,\"た\":1,\"て\":2},\"ま\":{\"す\":7,\"り\":1,\"で\":61,\"な\":1,\"お\":1,\"る\":58,\"せ\":59,\"だ\":1,\"さ\":1,\"し\":1,\"ろう\":1,\"職\":1},\"が\":{\"な\":2,\"家\":1,\"つ\":1,\"朝\":1,\"と\":1,\"、\":1,\"ダイエット\":1,\"普\":1,\"絶\":1,\"北\":1,\"あ\":2,\"い\":1,\"開\":1,\"連\":1,\"人\":1,\"…！」\":1,\"こ\":1,\"取\":1,\"す\":1},\"😘✨\":{\"\\n\":1},\"言\":{\":お\":1,\"う\":1,\"葉\":1,\"☞\":1,\"っ\":1,\":\":2,\"→\":1},\":お\":{\"前\":1},\"は\":{\"一\":3,\"・・・（\":1,\"よう\":1,\"……！\":1,\"な\":1,\"生\":58,\"、\":59,\"ま\":1,\"1900kcal」\":1,\"い\":3,\"満\":1,\"普\":1,\"反\":1,\"で\":1,\"大\":1,\"僕\":1,\"そ\":1,\"デカイ\":1,\"よー！\":1,\"、アートフレーム...\":1},\"生\":{\"も\":1,\"き\":58,\"开\":2,\"の\":1,\"徒\":2,\"来\":1},\"も\":{\"ん\":2,\"行\":1,\"っ\":1,\"の\":116,\"う\":1,\"ど\":1,\"、１\":1,\"話\":1,\"尊\":1,\"いろいろ\":1},\"ダチ💖\":{},\"RT\":{\"@KATANA77:\":1,\"@omo_kko:\":1,\"@thsc782_407:\":1,\"@AFmbsk:\":1,\"@shiawaseomamori:\":58,\"@POTENZA_SUPERGT:\":1,\"@UARROW_Y:\":2,\"@assam_house:\":1,\"@Takashi_Shiina:\":1,\"@naopisu_:\":1,\"@oen_yakyu:\":1,\"@Ang_Angel73:\":1,\"@takuramix:\":1,\"@siranuga_hotoke:\":1,\"@fightcensorship:\":1},\"@KATANA77:\":{\"え\":1},\"え\":{\"っ\":1,\"な\":3,\"て\":1,\"続\":1,\"ば\":1},\"そ\":{\"れ\":4,\"の\":1,\"う\":4,\"わろ\":1,\"うよ！あ\":1},\"・・・（\":{\"一\":1},\"同\":{\"）\":1,\"意\":1,\"「……………。」\":1},\"）\":{\"http://t.co/PkCJAcSuYK\":1},\"http://t.co/PkCJAcSuYK\":{},\"@longhairxMIURA\":{\"朝\":1},\"朝\":{\"一\":3},\"ライカス\":{\"辛\":1},\"辛\":{\"目\":1},\"目\":{\"だ\":1,\"が\":1},\"だ\":{\"よw\":1,\"な\":58,\"け\":1,\"与\":1,\"！」\":1,\"れ\":1,\"っ\":1,\"と\":1,\"よ。\":1,\"よ\":1},\"よw\":{},\"@omo_kko:\":{\"ラウワン\":1},\"ラウワン\":{\"脱\":1},\"脱\":{\"出\":1},\"→\":{\"友\":1,\"墓\":1,\"な\":2,\"誰\":1},\"友\":{\"達\":3},\"達\":{\"が\":1,\"ん\":1,\"おろ\":1},\"家\":{\"に\":2,\"族\":2},\"に\":{\"連\":1,\"乗\":1,\"「ハウステンボス」を\":1,\"つ\":2,\"す\":2,\"一\":4,\"身\":1,\"し\":61,\"止\":58,\"な\":59,\"正\":58,\"ある\":58,\"会\":1,\"必\":2,\"、\":1,\"私\":1,\"行\":1,\"や\":4,\"陸\":1,\"ヨセアツメ\":1,\"取\":1,\"か\":1,\"基\":1,\"対\":1,\"関\":2,\"受\":1,\"当\":1,\"も\":1,\"い\":1,\"平\":1},\"連\":{\"ん\":1,\"れ\":1},\"帰\":{\"っ\":1,\"る(1\":1},\"う\":{\"か\":1,\"ご\":2,\"で\":2,\"一\":1,\"ぞ\":1,\"見\":1,\"ち\":1,\"に\":1,\"思\":1,\"だ\":1},\"ら\":{\"友\":1,\"な\":1,\"人\":1,\"し\":1,\"や\":1,\"も\":1},\"乗\":{\"せ\":1},\"せ\":{\"て\":1,\"ん\":58,\"られ\":1,\"ん。\":1,\"た\":1,\"焼\":1},\"る(1\":{\"度\":1},\"度\":{\"も\":1},\"行\":{\"っ\":2,\"き\":1,\"妨\":1,\"為\":1,\"部\":1},\"た\":{\"こ\":1,\"〜（≧∇≦）\":1,\"。\":60,\"だ\":1,\"知\":1,\"め\":1,\"の\":1,\"人\":3,\"www\":1,\"(\":1,\"り\":2,\"り、\":1,\"実\":1,\"楽\":1,\"赤\":1,\"い\":1,\"っ\":1,\"ん\":1,\"らシメる\":1,\"ら×\":1,\"し\":1,\"？？\":1,\"【\":1},\"舎\":{\"道\":1},\"道\":{\")→\":1,\"進\":1,\"路\":2,\"の\":1},\")→\":{\"友\":1},\"おろ\":{\"し\":1},\"し\":{\"て\":67,\"そ\":1,\"い\":120,\"た\":62,\"ょ\":58,\"ま\":1,\"よう\":1,\"い　　　　　\":1,\"か\":1,\"右\":1,\"、\":1,\"隊\":1,\"は\":1,\"い、、、\":1},\"迷\":{\"子\":1},\"子\":{\"→500メートル\":1,\"で\":1,\"や\":1,\"。\":2},\"→500メートル\":{\"く\":1},\"く\":{\"らい\":1,\"変\":1,\"も\":58,\"て\":3,\"そ\":1,\"面\":1,\"っ\":1},\"らい\":{\"続\":1},\"続\":{\"く\":1,\"け\":1,\"試\":1},\"変\":{\"な\":1,\"！\":1},\"本\":{\"道\":1,\"当\":58},\"進\":{\"む\":1,\"ま\":1},\"む\":{\"→\":1},\"墓\":{\"地\":1},\"地\":{\"で\":1,\"区\":1,\"所\":1,\"図\":1,\"江\":2,\"将\":4,\"东\":2,\"今\":2},\"止\":{\"ま\":59},\"り\":{\"で\":1,\"と\":2,\"ま\":58,\"急\":58,\"に\":58,\"会\":1,\"の\":1,\"だ\":1,\"締\":1},\"Uターン\":{\"出\":1},\"来\":{\"ず\":1,\"る\":1,\"一\":2,\"な\":1},\"バック\":{\"で\":1},\"500メートル\":{\"元\":1},\"元\":{\"の\":1,\"に\":1},\"ろ\":{\"ま\":1,\"一\":1,\"し\":1},\"け\":{\"な\":1,\"が\":1,\"る\":1,\"で\":1,\"て\":1,\"た\":1,\"と\":1,\"！！wあー、\":1},\"い←\":{\"今\":1},\"@thsc782_407:\":{\"#LEDカツカツ\":1},\"#LEDカツカツ\":{\"選\":1},\"選\":{\"手\":1,\"択\":2},\"手\":{\"権\":1,\"元\":1},\"権\":{\"\":1,\"利\":1},\"漢\":{\"字\":1},\"字\":{\"一\":1,\"ぶ\":1},\"文\":{\"字\":1},\"スペース\":{\"に\":1},\"「ハウステンボス」を\":{\"収\":1},\"収\":{\"め\":1},\"る\":{\"狂\":1,\"と\":59,\"な\":2,\"ま\":58,\"こ\":2,\"国\":2,\"意\":1,\"か\":1,\"\\n\":1,\"笑\":1,\"\\n\\nお\":1,\"利\":1,\"人\":1,\"一\":1,\"気\":1,\"ほ\":1,\"も\":1,\"音\":1,\"正\":1},\"狂\":{\"気\":1},\"気\":{\"http://t.co/vmrreDMziI\":1,\"持\":58,\"が\":1},\"http://t.co/vmrreDMziI\":{},\"【\":{\"金\":1,\"状\":1,\"大\":1,\"映\":1,\"反\":1},\"金\":{\"一\":1},\"区\":{\"太\":1,\"別\":1},\"太\":{\"鼓\":1,\"郎\":1},\"鼓\":{\"台\":1},\"台\":{\"】\":1,\"消\":2},\"】\":{\"川\":1,\"http://t.co/PjL9if8OZC\":1},\"川\":{\"関\":1,\"の\":1,\"盆\":4,\"光\":1,\"一\":1},\"関\":{\"と\":1,\"節\":1,\"わり\":1,\"す\":1},\"小\":{\"山\":1,\"学\":2,\"川\":1},\"山\":{\"の\":1,\"崎\":1},\"見\":{\"分\":1,\"英\":2,\"を\":1,\"た\":1,\"て\":1,\"る:\":1},\"分\":{\"け\":1,\"～\":1},\"つ\":{\"か\":1,\"い\":2,\"簡\":1,\"天\":1,\"剣\":1},\"お\":{\"は\":2,\"言\":1,\"ち\":1},\"よう\":{\"ご\":1,\"な\":1,\"か\":2,\"と\":1},\"ざ\":{\"い\":3},\"ん♪\":{\"SSDS\":1},\"SSDS\":{\"の\":1},\"DVD\":{\"が\":1},\"届\":{\"い\":1},\"〜（≧∇≦）\":{},\"@ran_kirazuki\":{\"そ\":1},\"葉\":{\"を\":1},\"頂\":{\"け\":1},\"……！\":{\"こ\":1},\"雨\":{\"太\":1,\"き\":1,\"开\":2,\":\":2,\"或\":2,\"天\":2},\"郎\":{\"、\":1},\"、\":{\"誠\":1,\"常\":1,\"美\":1,\"正\":58,\"こ\":58,\"前\":58,\"ど\":58,\"一\":58,\"無\":1,\"東\":1,\"再\":1,\"も\":1,\"そ\":1,\"笑\":1,\"学\":1,\"通\":1,\"四\":2,\"三\":1,\"井\":1},\"誠\":{\"心\":1,\"意\":1},\"心\":{\"誠\":1},\"意\":{\"を\":1,\"味\":58,\"」\":1,\"見\":1},\"持\":{\"っ\":1,\"ち\":58,\"者\":1,\"つ\":1},\"姉\":{\"御\":1},\"御\":{\"の\":1},\"足\":{\"の\":1},\"指\":{\"の\":1,\"定\":1},\"節\":{\"を\":1},\"崇\":{\"め\":1,\"徳\":2},\"奉\":{\"り\":1},\"@AFmbsk:\":{\"@samao21718\":1},\"@samao21718\":{\"\\n\":1},\"呼\":{\"び\":3,\"ば\":3},\"び\":{\"方\":3},\"方\":{\"☞\":1,\"☞あー\":1,\":うえ\":1,\":\":3,\"は\":1,\"か\":1},\"☞\":{\"ま\":1,\"平\":1,\"も\":1,\"楽\":1,\"全\":1},\"ち\":{\"ゃ\":7,\"ば\":58,\"ょ\":1,\"ら。\":1,\"に\":1},\"ゃ\":{\"ん\":6,\"んを\":1,\"な\":1},\"ば\":{\"れ\":3,\"か\":58,\"いいん\":1},\"☞あー\":{\"ち\":1},\"平\":{\"野\":1,\"\":1,\"均\":1},\"野\":{\"か\":1,\"滉\":1},\"ら？！\":{\"\\n\":1},\"☞お\":{\"と\":1},\"ぽ\":{\"い！！\":1},\"い！！\":{\"\\nLINE\":1},\"るん\\\\(\":{\"ˆoˆ\":1},\"ˆoˆ\":{\")/\":1},\")/\":{\"\\nトプ\":1},\"楽\":{\"し\":2},\"いー\":{\"な\":1},\"😳\":{\"\\n\":1},\"族\":{\"に\":2},\"ら☞お\":{\"ね\":1},\"ね\":{\"ぇ\":1,\"(´･_･`)♡\":1,\"！」\":1,\"！\":1,\"！ティアラ\":1,\"♡\":1},\"ぇ\":{\"ち\":1},\"最\":{\"後\":3},\"後\":{\"に\":3},\"全\":{\"然\":1,\"車\":1,\"国\":1},\"然\":{\"会\":1},\"会\":{\"え\":2,\"場\":1,\"長\":1},\"い…\":{},\"常\":{\"に\":1},\"身\":{\"一\":1},\"簡\":{\"素\":1},\"素\":{\"に\":1},\"美\":{\"食\":1},\"食\":{\"を\":1,\"え\":1},\"@shiawaseomamori:\":{\"一\":58},\"書\":{\"い\":58,\"提\":1},\"正\":{\"し\":116,\"式\":1},\"いう\":{\"意\":58,\"気\":58,\"の\":58},\"味\":{\"だ\":58,\"方\":1},\"年\":{\"に\":58,\"08\":1,\"運\":1},\"知\":{\"り\":58,\"事\":2},\"。\":{\"人\":58,\"魔\":1,\"\\nRT\":1,\"明\":2,\"预\":2,\"\\n\":1},\"人\":{\"は\":59,\"男\":1,\"に\":3,\"質\":1,\"格\":1,\"。\":1},\"いる\":{\"と\":58,\"量\":1,\"私\":1},\"へ\":{\"前\":58,\"と\":58,\"移\":1},\"急\":{\"い\":58},\"ど\":{\"ん\":117,\"う\":2,\"ね\":1},\"大\":{\"切\":58,\"盛\":1,\"学\":1,\"阪\":2,\"拡\":1,\"暴\":2,\"変\":1,\"事\":1},\"切\":{\"な\":58},\"置\":{\"き\":58},\"去\":{\"り\":58},\"ょ\":{\"う。\":58,\"っ\":1},\"う。\":{\"本\":58},\"当\":{\"に\":58,\"た\":1},\"番\":{\"初\":58},\"初\":{\"め\":58},\"場\":{\"所\":58,\"入\":1,\"おい\":1,\"一\":1},\"所\":{\"に\":58,\"有\":1,\"持\":1},\"ある\":{\"の\":58},\"…\":{\"僕\":1},\"@POTENZA_SUPERGT:\":{\"あり\":1},\"あり\":{\"が\":1},\"！“@8CBR8:\":{\"@POTENZA_SUPERGT\":1},\"@POTENZA_SUPERGT\":{\"13\":1},\"時\":{\"30\":1,\"半\":1,\"計\":1,\"～\":1},\"半\":{\"ご\":1},\"無\":{\"事\":1},\"事\":{\"全\":1,\"は\":1,\"に\":1,\"！\":1,\"し\":1},\"車\":{\"決\":1},\"決\":{\"勝\":2,\"定\":1},\"勝\":{\"レース\":1,\"戦\":1},\"レース\":{\"完\":1},\"完\":{\"走\":1},\"走\":{\"出\":1},\"祈\":{\"っ\":1},\"http://t.co/FzTyFnt9xH”\":{},\"@UARROW_Y:\":{\"よう\":2},\"体\":{\"操\":3},\"操\":{\"第\":3},\"踊\":{\"る\":2,\"っ\":1},\"国\":{\"見\":2,\"の\":1},\"英\":{\"http://t.co/SXoYWH98as\":2},\"http://t.co/SXoYWH98as\":{},\"日\":{\"は\":1,\"20:47:53\":1,\"多\":2,\"电\":2,\")\":2,\"，\":2,\"子\":2,\"ま\":1,\"一\":1,\"南\":1},\"高\":{\"と\":1,\"校\":2},\"三\":{\"桜\":1,\"軍\":1,\"浦\":2,\"重\":1},\"桜\":{\"（・θ・）\":1},\"（・θ・）\":{\"\\n\":1},\"光\":{\"梨\":1,\")-「ソードマスター」\":1,\"筆\":1},\"梨\":{\"ち\":1},\"〜\":{},\"@assam_house:\":{\"泉\":1},\"泉\":{\"田\":1},\"新\":{\"潟\":1,\"网\":2,\"品\":1},\"潟\":{\"県\":1},\"県\":{\"知\":1},\"東\":{\"電\":1,\"宝\":1},\"電\":{\"の\":1},\"申\":{\"請\":1},\"請\":{\"書\":1},\"提\":{\"出\":1},\"容\":{\"認\":1},\"認\":{\"さ\":1,\"め\":1},\"さ\":{\"せ\":1,\"い。\":1,\"に\":1,\"、\":1,\"れ\":2,\"い！\":1,\"と\":1,\"ん\":2,\"れる\":1,\"れる）」\":1},\"られ\":{\"た\":2,\"し\":1},\"再\":{\"稼\":2},\"稼\":{\"働\":2},\"働\":{\"に\":1,\"を\":1},\"必\":{\"要\":1,\"死\":1},\"要\":{\"な\":1},\"「\":{\"同\":1,\"成\":1,\"く\":1,\"剣\":1,\"不\":1},\"」\":{\"は\":1,\"の\":1},\"与\":{\"え\":1},\"ん。\":{\"今\":1},\"柏\":{\"崎\":1},\"崎\":{\"刈\":1,\"貴\":1},\"刈\":{\"羽\":1},\"羽\":{\"の\":1},\"抑\":{\"え\":1},\"踏\":{\"ん\":1},\"張\":{\"りをお\":1},\"りをお\":{\"願\":1},\"願\":{\"い\":2},\"送\":{\"っ\":1,\"局\":2},\"下\":{\"さ\":2,\"一\":1},\"い。\":{\"全\":1},\"皆\":{\"様\":1},\"様\":{\"、お\":1},\"、お\":{\"願\":1},\"\\nhttp://t.co…\":{},\"@Takashi_Shiina:\":{\"テレビ\":1},\"テレビ\":{\"で\":1},\"成\":{\"人\":1},\"男\":{\"性\":1},\"性\":{\"の\":1},\"カロリー\":{\"摂\":1},\"摂\":{\"取\":1},\"取\":{\"量\":1,\"られ\":1,\"り\":1},\"量\":{\"は\":1,\"で\":1},\"1900kcal」\":{\"と\":1},\"私\":{\"が\":1,\"道\":1},\"ダイエット\":{\"の\":1},\"死\":{\"で\":1},\"キープ\":{\"し\":1},\"、「\":{\"そ\":1},\"普\":{\"通\":2},\"通\":{\"な\":1,\"っ\":1,\"の\":1,\"行\":1},\"天\":{\"9\":2,\"一\":1,\"(31\":2,\"气\":2,\"，\":2,\"下\":1,\"冥\":2},\"や\":{\"ココイチ\":1,\"る\":3,\"っ\":1,\"るww\":1,\"赤\":1,\"ま\":1,\"け\":1},\"ココイチ\":{\"に\":1},\"盛\":{\"りを\":1,\"り\":1},\"りを\":{\"食\":1},\"いいん\":{\"だ\":1},\"！」\":{\"と\":1,\"\\n\":1},\"@kohecyan3\":{\"\\n\":1},\"上\":{\"野\":1,\"真\":1,\"一\":1},\"滉\":{\"平\":1},\":うえ\":{\"の\":1},\"過\":{\"剰\":1},\"剰\":{\"な\":1},\"俺\":{\"イケメン\":1,\"の\":1},\"イケメン\":{\"で\":1},\"アピール\":{\"\\n\":1},\":バーバリー\":{\"の\":1},\"計\":{\"\":1},\"ろ:あ\":{\"の\":1},\"自\":{\"信\":1},\"信\":{\"さ\":1},\"笑\":{\"い\":1,\"ｗｗ\":1},\"絶\":{\"え\":1},\"学\":{\"受\":1,\"校\":1,\"日\":2,\"生\":2,\"的\":2},\"受\":{\"か\":1,\"け\":1,\"診\":1},\"？\":{\"応\":1},\"応\":{\"援\":1},\"援\":{\"し\":1},\"る〜(*^^*)！\":{\"\\n\\n#RT\":1},\"\\n\\n#RT\":{\"し\":1},\"軍\":{\"か\":1,\"兵\":1},\"ら２\":{\"個\":1},\"個\":{\"師\":1},\"師\":{\"団\":2,\"匠\":1},\"団\":{\"が\":1,\"長\":1},\"北\":{\"へ\":1,\"部\":2},\"移\":{\"動\":1},\"動\":{\"中\":1,\"画\":1,\"員\":1},\"中\":{\"ら\":1,\"京\":2,\"継\":2,\"新\":2,\"央\":2,\"小\":2,\"部\":2,\"古\":1,\"國\":1},\"い　　　　　\":{\"こ\":1},\"調\":{\"子\":1},\"満\":{\"州\":1,\"喫\":1},\"州\":{\"に\":1},\"陸\":{\"軍\":1},\"兵\":{\"力\":1},\"力\":{\"が\":1},\"ふ\":{\"れ\":1,\"ぁ\":1},\"える\":{},\"@naopisu_:\":{\"呼\":1},\"ら:\":{\"\\n\":1},\"\\n#RT\":{\"し\":1},\"\\n\\nお\":{\"腹\":1},\"腹\":{\"痛\":1},\"痛\":{\"く\":1},\"寝\":{\"れ\":1},\"るww\":{\"\\n\":1},\"ぞ\":{\"〜😏🙌\":1},\"〜😏🙌\":{},\"レッドクリフ\":{\"の\":1},\"キャラ\":{\"の\":1},\"女\":{\"装\":1},\"装\":{\"っ\":1},\"わろ\":{\"た\":1},\"www\":{\"朝\":1},\"面\":{\"白\":2,\"子\":1},\"白\":{\"か\":1,\"い\":1},\"(\":{\"˘ω゜)\":1,\"三\":1},\"˘ω゜)\":{\"笑\":1},\"状\":{\"態\":1},\"態\":{\"良\":1},\"良\":{\"好\":1},\"】ペンタックス・デジタル\":{\"一\":1},\"眼\":{\"レフカメラ・K20D\":1,\"レフ\":1},\"レフカメラ・K20D\":{\"入\":1},\"入\":{\"札\":1,\"り\":1},\"札\":{\"数\":1},\"数\":{\"=38\":1},\"=38\":{\"現\":1},\"現\":{\"在\":2,\"場\":1},\"在\":{\"価\":1,\"の\":1,\"前\":1},\"価\":{\"格\":1},\"格\":{\"=15000\":1,\"的\":1},\"=15000\":{\"円\":1},\"円\":{\"http://t.co/4WK1f6V2n6\":1},\"http://t.co/4WK1f6V2n6\":{\"終\":1},\"終\":{\"了\":1},\"了\":{\"=2014\":1,\"！\":1},\"=2014\":{\"年\":1},\"08\":{\"月\":1},\"月\":{\"1\":2,\"31\":3,\"と\":1,\"恐\":1},\"20:47:53\":{\"#\":1},\"#\":{\"一\":1,\"天\":1},\"レフ\":{\"http://t.co/PcSaXzfHMW\":1},\"http://t.co/PcSaXzfHMW\":{},\"夢\":{\"見\":1},\"魔\":{\"法\":1},\"法\":{\"科\":1,\"に\":1},\"科\":{\"高\":1,\"二\":1,\"の\":1},\"校\":{\"通\":1,\"対\":1,\"の\":1,\"竹\":1},\"（\":{\"別\":1,\"中\":1,\"永\":1},\"別\":{\"に\":1,\"な\":1},\"二\":{\"科\":1,\"号\":1},\"い）クラスメイト\":{\"に\":1},\"ヨセアツメ\":{\"面\":1},\"赤\":{\"僕\":2},\"僕\":{\"の\":2,\"読\":1,\"が\":1},\"拓\":{\"也\":2},\"也\":{\"が\":2},\"対\":{\"抗\":1,\"崇\":1,\"中\":1,\"し\":1},\"抗\":{\"合\":1},\"唱\":{\"コンクール\":1},\"コンクール\":{\"が\":1},\"開\":{\"催\":1},\"催\":{\"さ\":1},\"際\":{\"他\":1,\"は\":1},\"他\":{\"校\":1},\"妨\":{\"害\":3},\"害\":{\"工\":1,\"行\":1,\"と\":1},\"工\":{\"作\":1},\"作\":{\"受\":1},\"り、\":{\"拓\":1},\"実\":{\"が\":1},\"質\":{\"に\":1},\"読\":{\"み\":1},\"@oen_yakyu:\":{\"●\":1},\"●\":{\"継\":1},\"継\":{\"続\":1,\"〉\":2},\"試\":{\"合\":1},\"京\":{\"対\":1,\"or\":1,\"青\":1},\"徳\":{\"）46\":1,\")　12\":1},\"）46\":{\"回\":1},\"回\":{\"～　9\":1,\"そ\":1},\"～　9\":{\"時\":1},\"～\":{\"\\n　〈ラジオ\":2,\"　http://t.co/lmlgp38fgZ\":1},\"\\n　〈ラジオ\":{\"中\":2},\"〉\":{\"\\n　ら\":2},\"\\n　ら\":{\"じ\":2},\"じ\":{\"る★ら\":2,\"る→\":2,\"る\":1,\"ゃ\":1},\"る★ら\":{\"じ\":2},\"る→\":{\"大\":2},\"阪\":{\"放\":2},\"放\":{\"送\":2},\"局\":{\"を\":2},\"択\":{\"→NHK-FM\":1,\"→NHK\":1},\"→NHK-FM\":{\"\\n●\":1},\"\\n●\":{\"決\":1},\"戦\":{\"(\":1,\"ウィンドウズ9\":1},\"浦\":{\"対\":1,\"春\":1},\"or\":{\"崇\":1},\")　12\":{\"時\":1},\"→NHK\":{\"第\":1},\"\\n　※\":{\"神\":1},\"神\":{\"奈\":1},\"奈\":{\"川\":1},\"ラ…\":{},\"@Ang_Angel73:\":{\"逢\":1},\"逢\":{\"坂\":1},\"坂\":{\"「\":1},\"秘\":{\"め\":1},\"右\":{\"目\":1},\"…！」\":{\"\\n\":1},\"「……………。」\":{},\"【H15-9-4】\":{\"道\":1},\"路\":{\"を\":1,\"一\":1},\"利\":{\"用\":1,\"益\":2,\"を\":1},\"用\":{\"す\":1,\"激\":1},\"益\":{\"は\":1,\"で\":1},\"反\":{\"射\":1,\"転\":1},\"射\":{\"的\":1,\"向\":1},\"的\":{\"利\":1,\"権\":1,\"日\":2,\"臉\":2},\"あり、\":{\"建\":1},\"建\":{\"築\":1},\"築\":{\"基\":1},\"基\":{\"準\":1,\"づ\":1},\"準\":{\"法\":1},\"づ\":{\"い\":1},\"定\":{\"が\":1,\"戦\":1},\"敷\":{\"地\":1},\"有\":{\"者\":1,\"强\":2,\"雨\":2},\"者\":{\"に\":1,\"\":1},\"為\":{\"の\":1},\"排\":{\"除\":1},\"除\":{\"を\":1},\"求\":{\"め\":1},\"い。→\":{\"誤\":1},\"誤\":{\"。\":1},\"@takuramix:\":{\"福\":1},\"福\":{\"島\":2},\"島\":{\"第\":2},\"原\":{\"発\":2},\"発\":{\"の\":1,\"　４\":1,\"動\":1},\"構\":{\"内\":1},\"内\":{\"地\":1,\"蒙\":2,\"由\":1},\"図\":{\"が\":1},\"ら。\":{\"\\nhttp://t.co/ZkU4TZCGPG\":1},\"\\nhttp://t.co/ZkU4TZCGPG\":{\"\\n\":1},\"、１\":{\"号\":1},\"号\":{\"機\":2,\"を\":1,\"「リン\":2},\"機\":{\"。\":1,\"　\":1},\"\\nRT\":{\"@Lightworker19:\":1},\"@Lightworker19:\":{\"【\":1},\"拡\":{\"散\":1},\"散\":{\"】　\":1},\"】　\":{\"福\":1},\"　４\":{\"号\":1},\"　\":{\"爆\":1,\"山\":1,\"踊\":1},\"爆\":{\"発\":1,\"笑\":1},\"　40\":{\"秒\":1},\"秒\":{\"～\":1},\"　http://t.co/lmlgp38fgZ\":{},\"四\":{\"川\":4},\"盆\":{\"地\":4},\"江\":{\"淮\":4},\"淮\":{\"等\":2,\"东\":2},\"等\":{\"地\":4},\"将\":{\"有\":4,\"迎\":2},\"强\":{\"降\":2},\"降\":{\"雨\":2},\"开\":{\"学\":4},\"多\":{\"地\":2},\"　　\":{\"中\":2},\"网\":{\"8\":2},\"电\":{\"据\":2},\"据\":{\"中\":2},\"央\":{\"气\":2,\"東\":1},\"气\":{\"象\":2,\"。\":2},\"消\":{\"息\":2,\"さ\":1},\"息\":{\"，\":2},\"，\":{\"江\":2,\"是\":2,\"内\":2,\"觀\":1,\"竟\":1},\"东\":{\"部\":2,\"北\":2},\"部\":{\"、\":2,\"等\":2,\"、...\":2,\"「\":1},\"(31\":{\"日\":2},\")\":{\"又\":2},\"又\":{\"将\":2},\"迎\":{\"来\":2},\"场\":{\"暴\":2},\"暴\":{\"雨\":4},\"或\":{\"大\":2},\"明\":{\"天\":4,\"日\":1},\"是\":{\"中\":2,\"非\":1},\"预\":{\"计\":2},\"计\":{\"明\":2},\"蒙\":{\"古\":2},\"古\":{\"中\":2,\"品\":1},\"、...\":{\"http://t.co/toQgVlXPyH\":1,\"http://t.co/RNdqIHmTby\":1},\"http://t.co/toQgVlXPyH\":{},\"@Take3carnifex\":{\"そ\":1},\"命\":{\"に\":1},\"わり\":{\"ま\":1},\"非\":{\"う\":1},\"診\":{\"し\":1},\"い！\":{},\"ｗｗ\":{\"珍\":1},\"珍\":{\"解\":1},\"解\":{\"答\":1},\"答\":{\"集\":1,\"だ\":1},\"集\":{\"！\":1},\"先\":{\"生\":1},\"ツメ\":{\"の\":1},\"甘\":{\"さ\":1},\"徒\":{\"の\":1,\"会\":1},\"センスを\":{\"感\":1},\"感\":{\"じ\":1},\"問\":{\"一\":1},\"FB\":{\"で\":1},\"話\":{\"題\":1},\"題\":{\"！！\":1},\"！！\":{\"\\nう\":1},\"\\nう\":{\"ど\":1},\"ウィンドウズ9\":{\"三\":1},\"重\":{\"高\":1},\"竹\":{\"内\":1},\"由\":{\"恵\":1},\"恵\":{\"アナ\":1},\"アナ\":{\"花\":1},\"花\":{\"火\":1},\"火\":{\"保\":1},\"保\":{\"険\":1},\"険\":{\"\":1},\"\\nhttp://t.co/jRWJt8IrSB\":{\"http://t.co/okrAoxSbt0\":1},\"http://t.co/okrAoxSbt0\":{},\"@nasan_arai\":{\"\\n\":1},\"ー\":{\"さ\":2},\"誰\":{\"。(´･_･`)\":1},\"。(´･_･`)\":{\"\\n\":1},\"→れいら♡\":{\"\\nLINE\":1},\"る？→\":{\"し\":1},\"る(｢･ω･)｢\":{\"\\n\":1},\"ろ→\":{\"可\":1},\"可\":{\"愛\":1},\"愛\":{\"い\":1,\"し\":1},\"優\":{\"し\":3},\"〜(´･_･`)♡GEM\":{\"現\":1},\"おい\":{\"で\":1},\"(´･_･`)♡\":{\"\\n\\n#\":1},\"\\n\\n#\":{\"ふ\":1},\"ぁ\":{\"ぼ\":1},\"ぼ\":{\"し\":1},\"\\\"ソードマスター\\\"\":{\"剣\":1},\"剣\":{\"聖\":2,\"士\":1,\"の\":1},\"聖\":{\"カミイズミ\":1,\"」\":1},\"カミイズミ\":{\"(CV:\":1},\"(CV:\":{\"緑\":1},\"緑\":{\"川\":1},\")-「ソードマスター」\":{\"の\":1},\"アスタリスク\":{\"所\":1},\"長\":{\"に\":1,\"と\":1},\"称\":{\"号\":1},\"士\":{\"。イデア\":1},\"。イデア\":{\"の\":1},\"匠\":{\"。\":1},\"敵\":{\"味\":1},\"尊\":{\"敬\":1},\"敬\":{\"さ\":1},\"れる\":{\"一\":1},\"流\":{\"の\":1},\"武\":{\"人\":1},\"闇\":{\"「リン\":1,\"「（\":1},\"「リン\":{\"と\":1,\"ち\":2},\"付\":{\"き\":1},\"歳\":{\"の\":1},\"差\":{\"以\":1},\"以\":{\"外\":1},\"外\":{\"に\":1},\"いろいろ\":{\"壁\":1},\"壁\":{\"が\":1},\"よ。\":{\"愛\":1},\"隊\":{\"の\":1},\"風\":{\"紀\":1},\"紀\":{\"厨\":1},\"厨\":{\"の\":1},\"…」\":{\"\\n\":3},\"んを\":{\"泣\":1},\"泣\":{\"か\":1},\"らシメる\":{\"か\":1},\"ら×\":{\"す\":1},\"執\":{\"行\":1},\"不\":{\"純\":1},\"純\":{\"な\":1},\"締\":{\"ま\":1},\"ろう\":{\"じ\":1},\"「（\":{\"消\":1},\"れる）」\":{},\"\\\"@BelloTexto:\":{\"¿Quieres\":1},\"¿Quieres\":{\"ser\":1},\"ser\":{\"feliz?\":1},\"feliz?\":{\"\\n\":1},\"\\\"No\":{\"stalkees\\\"\":5,\"stalkees\\\".\\\"\":1},\"stalkees\\\"\":{\"\\n\":5},\"stalkees\\\".\\\"\":{},\"@kaoritoxx\":{\"そ\":1},\"うよ！あ\":{\"た\":1},\"うよう\":{\"に\":1},\"おる。い\":{\"ま\":1},\"職\":{\"場\":1},\"る(°_°)！\":{\"満\":1},\"喫\":{\"幸\":1},\"幸\":{\"せ\":1},\"焼\":{\"け\":1},\"！！wあー、\":{\"な\":1},\"ほ\":{\"ど\":1},\"毎\":{\"回\":1},\"よ\":{\"ね\":1},\"！ティアラ\":{\"ち\":1},\"♡\":{\"五\":1},\"五\":{\"月\":1},\"九\":{\"月\":1},\"恐\":{\"ろ\":1},\"い、、、\":{\"\\nハリポタエリア\":1},\"\\nハリポタエリア\":{\"は\":1},\"？？\":{},\"@itsukibot_\":{\"一\":1},\"稀\":{\"の\":1},\"ソーセージをペロペロ\":{\"す\":1},\"音\":{\"は\":1},\"デカイ\":{},\"冥\":{\"の\":2},\"標\":{\"VI\":2},\"VI\":{\"宿\":2},\"宿\":{\"怨\":2},\"怨\":{\"PART1\":2},\"PART1\":{\"/\":1},\"/\":{\"小\":1},\"水\":{\"\":1},\"\\nhttp://t.co/fXIgRt4ffH\":{\"\\n\":1},\"\\n#キンドル\":{\"#\":1},\"http://t.co/RNdqIHmTby\":{},\"@vesperia1985\":{\"お\":1},\"よー！\":{\"\\n\":1},\"よ…！！\":{\"明\":1},\"いい\":{},\"映\":{\"画\":1},\"パンフレット】　\":{\"永\":1},\"永\":{\"遠\":2},\"遠\":{\"の\":2},\"０\":{\"（\":1},\"ゼロ）　\":{\"監\":1},\"監\":{\"督\":1},\"督\":{\"　\":1},\"貴\":{\"　キャスト　\":1},\"　キャスト　\":{\"岡\":1},\"岡\":{\"田\":1},\"准\":{\"一\":1},\"春\":{\"馬\":1},\"馬\":{\"、\":1},\"井\":{\"上\":1},\"真\":{\"央\":1},\"宝\":{\"(2)11\":1},\"(2)11\":{\"点\":1},\"点\":{\"の\":1},\"品\":{\"／\":1,\"を\":1,\"の\":1},\"／\":{\"中\":1},\"る:\":{\"￥\":1},\"￥\":{\"500より\":1},\"500より\":{\"\\n(\":1},\"\\n(\":{\"こ\":1},\"商\":{\"品\":1},\"ランク\":{\"に\":1},\"式\":{\"な\":1,\"，\":1},\"情\":{\"報\":1},\"報\":{\"に\":1},\"、アートフレーム...\":{\"http://t.co/4hbyB1rbQ7\":1},\"http://t.co/4hbyB1rbQ7\":{},\"@siranuga_hotoke:\":{\"ゴキブリ\":1},\"ゴキブリ\":{\"は\":1},\"世\":{\"帯\":1},\"帯\":{\"に\":1},\"均\":{\"し\":1},\"匹\":{\"いる。\":1},\"いる。\":{},\"@fightcensorship:\":{\"李\":1},\"李\":{\"克\":2},\"克\":{\"強\":2},\"強\":{\"總\":1,\"的\":1},\"總\":{\"理\":2},\"理\":{\"的\":1,\"李\":1},\"臉\":{\"綠\":1,\"。http://t.co/HLX9mHcQwe\":1},\"綠\":{\"了\":1},\"南\":{\"京\":1},\"青\":{\"奧\":1},\"奧\":{\"會\":1},\"會\":{\"閉\":1},\"閉\":{\"幕\":1},\"幕\":{\"式\":1},\"觀\":{\"眾\":1},\"眾\":{\"席\":1},\"席\":{\"上\":1},\"貪\":{\"玩\":1},\"玩\":{\"韓\":1},\"韓\":{\"國\":1},\"國\":{\"少\":1,\"總\":1},\"少\":{\"年\":1},\"運\":{\"動\":1},\"員\":{\"，\":1},\"竟\":{\"斗\":1},\"斗\":{\"膽\":1},\"膽\":{\"用\":1},\"激\":{\"光\":1},\"筆\":{\"射\":1},\"向\":{\"中\":1},\"。http://t.co/HLX9mHcQwe\":{\"http://t.co/fVVOSML5s8\":1},\"http://t.co/fVVOSML5s8\":{},\"【マイリスト】【\":{\"彩\":1},\"彩\":{\"りりあ】\":1},\"りりあ】\":{\"妖\":1},\"妖\":{\"怪\":1},\"怪\":{\"体\":1},\"転\":{\"】\":1},\"http://t.co/PjL9if8OZC\":{\"#sm24357625\":1},\"#sm24357625\":{}}",
    ) as Record<string, Record<string, number>>;
}
/* eslint-enable */

/* eslint-disable quote-props, @typescript-eslint/comma-dangle, max-len */
export function miniTwitterJson() {
    return {
        "statuses": [
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:15 +0000 2014",
                "id": 505874924095815700,
                "id_str": "505874924095815681",
                "text": "@aym0566x \n\n名前:前田あゆみ\n第一印象:なんか怖っ！\n今の印象:とりあえずキモい。噛み合わない\n好きなところ:ぶすでキモいとこ😋✨✨\n思い出:んーーー、ありすぎ😊❤️\nLINE交換できる？:あぁ……ごめん✋\nトプ画をみて:照れますがな😘✨\n一言:お前は一生もんのダチ💖",
                //                                                           /
                // "text": "ラウワン脱出→友達が家に連んで帰ってって言うから友達ん家に乗せて帰る(1度もったことない田舎道行)→友達おろして迷子→500メートルくらい続く変な一本道進む→墓地で行き止まりでUターン出来ずバックで500メートル元のところまで進まないといけない←今ここ",
                // "text": "RT @omo_kko: ラウワン脱出→友達が家に連んで帰ってって言うから友達ん家に乗せて帰る(1度も行ったことない田舎道)→友達おろして迷子→500メートルくらい続く変な一本道進む→墓地で行き止まりでUターン出来ずバックで500メートル元のところまで進まないといけない←今ここ",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": 866260188,
                "in_reply_to_user_id_str": "866260188",
                "in_reply_to_screen_name": "aym0566x",
                "user": {
                    "id": 1186275104,
                    "id_str": "1186275104",
                    "name": "AYUMI",
                    "screen_name": "ayuu0123",
                    "location": "",
                    "description": "元野球部マネージャー❤︎…最高の夏をありがとう…❤︎",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 262,
                    "friends_count": 252,
                    "listed_count": 0,
                    "created_at": "Sat Feb 16 13:40:25 +0000 2013",
                    "favourites_count": 235,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 1769,
                    "lang": "en",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497760886795153410/LDjAwR_y_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497760886795153410/LDjAwR_y_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1186275104/1409318784",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "aym0566x",
                            "name": "前田あゆみ",
                            "id": 866260188,
                            "id_str": "866260188",
                            "indices": [
                                0,
                                9
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
        ],
        "search_metadata": {
            "completed_in": 0.087,
            "max_id": 505874924095815700,
            "max_id_str": "505874924095815681",
            "next_results": "?max_id=505874847260352512&q=%E4%B8%80&count=100&include_entities=1",
            "query": "%E4%B8%80",
            "refresh_url": "?since_id=505874924095815681&q=%E4%B8%80&include_entities=1",
            "count": 100,
            "since_id": 0,
            "since_id_str": "0"
        }
    };
}

export function twitterRawJson(): TwitterJson {
    return {
        "statuses": [
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:15 +0000 2014",
                "id": 505874924095815700,
                "id_str": "505874924095815681",
                "text": "@aym0566x \n\n名前:前田あゆみ\n第一印象:なんか怖っ！\n今の印象:とりあえずキモい。噛み合わない\n好きなところ:ぶすでキモいとこ😋✨✨\n思い出:んーーー、ありすぎ😊❤️\nLINE交換できる？:あぁ……ごめん✋\nトプ画をみて:照れますがな😘✨\n一言:お前は一生もんのダチ💖",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": 866260188,
                "in_reply_to_user_id_str": "866260188",
                "in_reply_to_screen_name": "aym0566x",
                "user": {
                    "id": 1186275104,
                    "id_str": "1186275104",
                    "name": "AYUMI",
                    "screen_name": "ayuu0123",
                    "location": "",
                    "description": "元野球部マネージャー❤︎…最高の夏をありがとう…❤︎",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 262,
                    "friends_count": 252,
                    "listed_count": 0,
                    "created_at": "Sat Feb 16 13:40:25 +0000 2013",
                    "favourites_count": 235,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 1769,
                    "lang": "en",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497760886795153410/LDjAwR_y_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497760886795153410/LDjAwR_y_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1186275104/1409318784",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "aym0566x",
                            "name": "前田あゆみ",
                            "id": 866260188,
                            "id_str": "866260188",
                            "indices": [
                                0,
                                9
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:14 +0000 2014",
                "id": 505874922023837700,
                "id_str": "505874922023837696",
                "text": "RT @KATANA77: えっそれは・・・（一同） http://t.co/PkCJAcSuYK",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 903487807,
                    "id_str": "903487807",
                    "name": "RT&ファボ魔のむっつんさっm",
                    "screen_name": "yuttari1998",
                    "location": "関西    ↓詳しいプロ↓",
                    "description": "無言フォローはあまり好みません ゲームと動画が好きですシモ野郎ですがよろしく…最近はMGSとブレイブルー、音ゲーをプレイしてます",
                    "url": "http://t.co/Yg9e1Fl8wd",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/Yg9e1Fl8wd",
                                    "expanded_url": "http://twpf.jp/yuttari1998",
                                    "display_url": "twpf.jp/yuttari1998",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 95,
                    "friends_count": 158,
                    "listed_count": 1,
                    "created_at": "Thu Oct 25 08:27:13 +0000 2012",
                    "favourites_count": 3652,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 10276,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/500268849275494400/AoXHZ7Ij_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/500268849275494400/AoXHZ7Ij_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/903487807/1409062272",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 23:49:35 +0000 2014",
                    "id": 505864943636197400,
                    "id_str": "505864943636197376",
                    "text": "えっそれは・・・（一同） http://t.co/PkCJAcSuYK",
                    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter Web Client</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 77915997,
                        "id_str": "77915997",
                        "name": "(有)刀",
                        "screen_name": "KATANA77",
                        "location": "",
                        "description": "プリキュア好きのサラリーマンです。好きなプリキュアシリーズはハートキャッチ、最愛のキャラクターは月影ゆりさんです。 http://t.co/QMLJeFmfMTご質問、お問い合わせはこちら http://t.co/LU8T7vmU3h",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": [
                                    {
                                        "url": "http://t.co/QMLJeFmfMT",
                                        "expanded_url": "http://www.pixiv.net/member.php?id=4776",
                                        "display_url": "pixiv.net/member.php?id=…",
                                        "indices": [
                                            58,
                                            80
                                        ]
                                    },
                                    {
                                        "url": "http://t.co/LU8T7vmU3h",
                                        "expanded_url": "http://ask.fm/KATANA77",
                                        "display_url": "ask.fm/KATANA77",
                                        "indices": [
                                            95,
                                            117
                                        ]
                                    }
                                ]
                            }
                        },
                        "protected": false,
                        "followers_count": 1095,
                        "friends_count": 740,
                        "listed_count": 50,
                        "created_at": "Mon Sep 28 03:41:27 +0000 2009",
                        "favourites_count": 3741,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 19059,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/808597451/45b82f887085d32bd4b87dfc348fe22a.png",
                        "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/808597451/45b82f887085d32bd4b87dfc348fe22a.png",
                        "profile_background_tile": true,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/480210114964504577/MjVIEMS4_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/480210114964504577/MjVIEMS4_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/77915997/1404661392",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "FFFFFF",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 82,
                    "favorite_count": 42,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": [],
                        "media": [
                            {
                                "id": 505864942575034400,
                                "id_str": "505864942575034369",
                                "indices": [
                                    13,
                                    35
                                ],
                                "media_url": "http://pbs.twimg.com/media/BwUxfC6CIAEr-Ye.jpg",
                                "media_url_https": "https://pbs.twimg.com/media/BwUxfC6CIAEr-Ye.jpg",
                                "url": "http://t.co/PkCJAcSuYK",
                                "display_url": "pic.twitter.com/PkCJAcSuYK",
                                "expanded_url": "http://twitter.com/KATANA77/status/505864943636197376/photo/1",
                                "type": "photo",
                                "sizes": {
                                    "medium": {
                                        "w": 600,
                                        "h": 338,
                                        "resize": "fit"
                                    },
                                    "small": {
                                        "w": 340,
                                        "h": 192,
                                        "resize": "fit"
                                    },
                                    "thumb": {
                                        "w": 150,
                                        "h": 150,
                                        "resize": "crop"
                                    },
                                    "large": {
                                        "w": 765,
                                        "h": 432,
                                        "resize": "fit"
                                    }
                                }
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 82,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "KATANA77",
                            "name": "(有)刀",
                            "id": 77915997,
                            "id_str": "77915997",
                            "indices": [
                                3,
                                12
                            ]
                        }
                    ],
                    "media": [
                        {
                            "id": 505864942575034400,
                            "id_str": "505864942575034369",
                            "indices": [
                                27,
                                49
                            ],
                            "media_url": "http://pbs.twimg.com/media/BwUxfC6CIAEr-Ye.jpg",
                            "media_url_https": "https://pbs.twimg.com/media/BwUxfC6CIAEr-Ye.jpg",
                            "url": "http://t.co/PkCJAcSuYK",
                            "display_url": "pic.twitter.com/PkCJAcSuYK",
                            "expanded_url": "http://twitter.com/KATANA77/status/505864943636197376/photo/1",
                            "type": "photo",
                            "sizes": {
                                "medium": {
                                    "w": 600,
                                    "h": 338,
                                    "resize": "fit"
                                },
                                "small": {
                                    "w": 340,
                                    "h": 192,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "large": {
                                    "w": 765,
                                    "h": 432,
                                    "resize": "fit"
                                }
                            },
                            "source_status_id": 505864943636197400,
                            "source_status_id_str": "505864943636197376"
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:14 +0000 2014",
                "id": 505874920140591100,
                "id_str": "505874920140591104",
                "text": "@longhairxMIURA 朝一ライカス辛目だよw",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": 505874728897085440,
                "in_reply_to_status_id_str": "505874728897085440",
                "in_reply_to_user_id": 114188950,
                "in_reply_to_user_id_str": "114188950",
                "in_reply_to_screen_name": "longhairxMIURA",
                "user": {
                    "id": 114786346,
                    "id_str": "114786346",
                    "name": "PROTECT-T",
                    "screen_name": "ttm_protect",
                    "location": "静岡県長泉町",
                    "description": "24 / XXX / @andprotector / @lifefocus0545 potato design works",
                    "url": "http://t.co/5EclbQiRX4",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/5EclbQiRX4",
                                    "expanded_url": "http://ap.furtherplatonix.net/index.html",
                                    "display_url": "ap.furtherplatonix.net/index.html",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 1387,
                    "friends_count": 903,
                    "listed_count": 25,
                    "created_at": "Tue Feb 16 16:13:41 +0000 2010",
                    "favourites_count": 492,
                    "utc_offset": 32400,
                    "time_zone": "Osaka",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 12679,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/481360383253295104/4B9Rcfys_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/481360383253295104/4B9Rcfys_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/114786346/1403600232",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "longhairxMIURA",
                            "name": "miura desu",
                            "id": 114188950,
                            "id_str": "114188950",
                            "indices": [
                                0,
                                15
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:14 +0000 2014",
                "id": 505874919020699650,
                "id_str": "505874919020699648",
                "text": "RT @omo_kko: ラウワン脱出→友達が家に連んで帰ってって言うから友達ん家に乗せて帰る(1度も行ったことない田舎道)→友達おろして迷子→500メートルくらい続く変な一本道進む→墓地で行き止まりでUターン出来ずバックで500メートル元のところまで進まないといけない←今ここ",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 392585658,
                    "id_str": "392585658",
                    "name": "原稿",
                    "screen_name": "chibu4267",
                    "location": "キミの部屋の燃えるゴミ箱",
                    "description": "RTしてTLに濁流を起こすからフォローしない方が良いよ 言ってることもつまらないし 詳細→http://t.co/ANSFlYXERJ 相方@1life_5106_hshd 葛西教徒その壱",
                    "url": "http://t.co/JTFjV89eaN",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/JTFjV89eaN",
                                    "expanded_url": "http://www.pixiv.net/member.php?id=1778417",
                                    "display_url": "pixiv.net/member.php?id=…",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": [
                                {
                                    "url": "http://t.co/ANSFlYXERJ",
                                    "expanded_url": "http://twpf.jp/chibu4267",
                                    "display_url": "twpf.jp/chibu4267",
                                    "indices": [
                                        45,
                                        67
                                    ]
                                }
                            ]
                        }
                    },
                    "protected": false,
                    "followers_count": 1324,
                    "friends_count": 1165,
                    "listed_count": 99,
                    "created_at": "Mon Oct 17 08:23:46 +0000 2011",
                    "favourites_count": 9542,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": true,
                    "verified": false,
                    "statuses_count": 369420,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/453106940822814720/PcJIZv43.png",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/453106940822814720/PcJIZv43.png",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505731759216943107/pzhnkMEg_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505731759216943107/pzhnkMEg_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/392585658/1362383911",
                    "profile_link_color": "5EB9FF",
                    "profile_sidebar_border_color": "FFFFFF",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 16:51:09 +0000 2014",
                    "id": 505759640164892700,
                    "id_str": "505759640164892673",
                    "text": "ラウワン脱出→友達が家に連んで帰ってって言うから友達ん家に乗せて帰る(1度も行ったことない田舎道)→友達おろして迷子→500メートルくらい続く変な一本道進む→墓地で行き止まりでUターン出来ずバックで500メートル元のところまで進まないといけない←今ここ",
                    "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 309565423,
                        "id_str": "309565423",
                        "name": "おもっこ",
                        "screen_name": "omo_kko",
                        "location": "",
                        "description": "ぱんすと",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 730,
                        "friends_count": 200,
                        "listed_count": 23,
                        "created_at": "Thu Jun 02 09:15:51 +0000 2011",
                        "favourites_count": 5441,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 30012,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/499126939378929664/GLWpIKTW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/499126939378929664/GLWpIKTW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/309565423/1409418370",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 67,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "omo_kko",
                            "name": "おもっこ",
                            "id": 309565423,
                            "id_str": "309565423",
                            "indices": [
                                3,
                                11
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:13 +0000 2014",
                "id": 505874918198624260,
                "id_str": "505874918198624256",
                "text": "RT @thsc782_407: #LEDカツカツ選手権\n漢字一文字ぶんのスペースに「ハウステンボス」を収める狂気 http://t.co/vmrreDMziI",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 753161754,
                    "id_str": "753161754",
                    "name": "ねこねこみかん＊",
                    "screen_name": "nekonekomikan",
                    "location": "ソーダ水のあふれるビンの中",
                    "description": "猫×6、大学・高校・旦那各1と暮らしています。猫、子供、日常思った事をつぶやいています／今年の目標：読書、庭の手入れ、ランニング、手芸／猫＊花＊写真＊詩＊林ももこさん＊鉄道など好きな方をフォローさせていただいています。よろしくお願いします♬",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 217,
                    "friends_count": 258,
                    "listed_count": 8,
                    "created_at": "Sun Aug 12 14:00:47 +0000 2012",
                    "favourites_count": 7650,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 20621,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/470627990271848448/m83uy6Vc_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/470627990271848448/m83uy6Vc_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Fri Feb 28 16:04:13 +0000 2014",
                    "id": 439430848190742500,
                    "id_str": "439430848190742528",
                    "text": "#LEDカツカツ選手権\n漢字一文字ぶんのスペースに「ハウステンボス」を収める狂気 http://t.co/vmrreDMziI",
                    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter Web Client</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 82900665,
                        "id_str": "82900665",
                        "name": "[90]青葉台  芦 (第二粟屋) 屋",
                        "screen_name": "thsc782_407",
                        "location": "かんましき",
                        "description": "湯の街の元勃酩姦なんちゃら大　赤い犬の犬（外資系）　肥後で緑ナンバー屋さん勤め\nくだらないことしかつぶやかないし、いちいち訳のわからない記号を連呼するので相当邪魔になると思います。害はないと思います。のりものの画像とかたくさん上げます。さみしい。車輪のついたものならだいたい好き。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 587,
                        "friends_count": 623,
                        "listed_count": 30,
                        "created_at": "Fri Oct 16 15:13:32 +0000 2009",
                        "favourites_count": 1405,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 60427,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "352726",
                        "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/154137819/__813-1103.jpg",
                        "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/154137819/__813-1103.jpg",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/493760276676620289/32oLiTtT_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/493760276676620289/32oLiTtT_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/82900665/1398865798",
                        "profile_link_color": "D02B55",
                        "profile_sidebar_border_color": "829D5E",
                        "profile_sidebar_fill_color": "99CC33",
                        "profile_text_color": "3E4415",
                        "profile_use_background_image": true,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 3291,
                    "favorite_count": 1526,
                    "entities": {
                        "hashtags": [
                            {
                                "text": "LEDカツカツ選手権",
                                "indices": [
                                    0,
                                    11
                                ]
                            }
                        ],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": [],
                        "media": [
                            {
                                "id": 439430848194936800,
                                "id_str": "439430848194936832",
                                "indices": [
                                    41,
                                    63
                                ],
                                "media_url": "http://pbs.twimg.com/media/BhksBzoCAAAJeDS.jpg",
                                "media_url_https": "https://pbs.twimg.com/media/BhksBzoCAAAJeDS.jpg",
                                "url": "http://t.co/vmrreDMziI",
                                "display_url": "pic.twitter.com/vmrreDMziI",
                                "expanded_url": "http://twitter.com/thsc782_407/status/439430848190742528/photo/1",
                                "type": "photo",
                                "sizes": {
                                    "medium": {
                                        "w": 600,
                                        "h": 450,
                                        "resize": "fit"
                                    },
                                    "large": {
                                        "w": 1024,
                                        "h": 768,
                                        "resize": "fit"
                                    },
                                    "thumb": {
                                        "w": 150,
                                        "h": 150,
                                        "resize": "crop"
                                    },
                                    "small": {
                                        "w": 340,
                                        "h": 255,
                                        "resize": "fit"
                                    }
                                }
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 3291,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "LEDカツカツ選手権",
                            "indices": [
                                17,
                                28
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "thsc782_407",
                            "name": "[90]青葉台  芦 (第二粟屋) 屋",
                            "id": 82900665,
                            "id_str": "82900665",
                            "indices": [
                                3,
                                15
                            ]
                        }
                    ],
                    "media": [
                        {
                            "id": 439430848194936800,
                            "id_str": "439430848194936832",
                            "indices": [
                                58,
                                80
                            ],
                            "media_url": "http://pbs.twimg.com/media/BhksBzoCAAAJeDS.jpg",
                            "media_url_https": "https://pbs.twimg.com/media/BhksBzoCAAAJeDS.jpg",
                            "url": "http://t.co/vmrreDMziI",
                            "display_url": "pic.twitter.com/vmrreDMziI",
                            "expanded_url": "http://twitter.com/thsc782_407/status/439430848190742528/photo/1",
                            "type": "photo",
                            "sizes": {
                                "medium": {
                                    "w": 600,
                                    "h": 450,
                                    "resize": "fit"
                                },
                                "large": {
                                    "w": 1024,
                                    "h": 768,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "small": {
                                    "w": 340,
                                    "h": 255,
                                    "resize": "fit"
                                }
                            },
                            "source_status_id": 439430848190742500,
                            "source_status_id_str": "439430848190742528"
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:13 +0000 2014",
                "id": 505874918039228400,
                "id_str": "505874918039228416",
                "text": "【金一地区太鼓台】川関と小山の見分けがつかない",
                "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2530194984,
                    "id_str": "2530194984",
                    "name": "川之江中高生あるある",
                    "screen_name": "kw_aru",
                    "location": "DMにてネタ提供待ってますよ",
                    "description": "川之江中高生の川之江中高生による川之江中高生のためのあるあるアカウントです。タイムリーなネタはお気に入りにあります。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 113,
                    "friends_count": 157,
                    "listed_count": 0,
                    "created_at": "Wed May 28 15:01:43 +0000 2014",
                    "favourites_count": 30,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 4472,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/471668359314948097/XbIyXiZK_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/471668359314948097/XbIyXiZK_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2530194984/1401289473",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:13 +0000 2014",
                "id": 505874915338104800,
                "id_str": "505874915338104833",
                "text": "おはようございますん♪ SSDSのDVDが朝一で届いた〜（≧∇≦）",
                "source": "<a href=\"http://tweetli.st/\" rel=\"nofollow\">TweetList!</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 428179337,
                    "id_str": "428179337",
                    "name": "サラ",
                    "screen_name": "sala_mgn",
                    "location": "東京都",
                    "description": "bot遊びと実況が主目的の趣味アカウント。成人済♀。時々TLお騒がせします。リフォ率低いですがＦ／Ｂご自由に。スパムはブロック！[HOT]K[アニメ]タイバニ/Ｋ/薄桜鬼/トライガン/進撃[小説]冲方丁/森博嗣[漫画]内藤泰弘/高河ゆん[他]声優/演劇 ※@sano_bot1二代目管理人",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        },
                    },
                    "protected": false,
                    "followers_count": 104,
                    "friends_count": 421,
                    "listed_count": 2,
                    "created_at": "Sun Dec 04 12:51:18 +0000 2011",
                    "favourites_count": 3257,
                    "utc_offset": -36000,
                    "time_zone": "Hawaii",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 25303,
                    "lang": "ja",
                    contributors_enabled: false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "1A1B1F",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/601682567/put73jtg48ytjylq00if.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/601682567/put73jtg48ytjylq00if.jpeg",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3350624721/755920942e4f512e6ba489df7eb1147e_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3350624721/755920942e4f512e6ba489df7eb1147e_normal.jpeg",
                    "profile_link_color": "2FC2EF",
                    "profile_sidebar_border_color": "181A1E",
                    "profile_sidebar_fill_color": "252429",
                    "profile_text_color": "666666",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:13 +0000 2014",
                "id": 505874914897690600,
                "id_str": "505874914897690624",
                "text": "@ran_kirazuki そのようなお言葉を頂けるとは……！この雨太郎、誠心誠意を持って姉御の足の指の第一関節を崇め奉りとうございます",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": 505874276692406300,
                "in_reply_to_status_id_str": "505874276692406272",
                "in_reply_to_user_id": 531544559,
                "in_reply_to_user_id_str": "531544559",
                "in_reply_to_screen_name": "ran_kirazuki",
                "user": {
                    "id": 2364828518,
                    "id_str": "2364828518",
                    "name": "雨",
                    "screen_name": "tear_dice",
                    "location": "変態/日常/創作/室町/たまに版権",
                    "description": "アイコンは兄さんから！",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 28,
                    "friends_count": 28,
                    "listed_count": 0,
                    "created_at": "Fri Feb 28 00:28:40 +0000 2014",
                    "favourites_count": 109,
                    "utc_offset": 32400,
                    "time_zone": "Seoul",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 193,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "000000",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/504434510675443713/lvW7ad5b.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/504434510675443713/lvW7ad5b.jpeg",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505170142284640256/rnW4XeEJ_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505170142284640256/rnW4XeEJ_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2364828518/1409087198",
                    "profile_link_color": "0D31BF",
                    "profile_sidebar_border_color": "000000",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "ran_kirazuki",
                            "name": "蘭ぴよの日常",
                            "id": 531544559,
                            "id_str": "531544559",
                            "indices": [
                                0,
                                13
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:13 +0000 2014",
                "id": 505874914591514600,
                "id_str": "505874914591514626",
                "text": "RT @AFmbsk: @samao21718 \n呼び方☞まおちゃん\n呼ばれ方☞あーちゃん\n第一印象☞平野から？！\n今の印象☞おとなっぽい！！\nLINE交換☞もってるん\\( ˆoˆ )/\nトプ画について☞楽しそうでいーな😳\n家族にするなら☞おねぇちゃん\n最後に一言☞全然会えない…",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2179759316,
                    "id_str": "2179759316",
                    "name": "まお",
                    "screen_name": "samao21718",
                    "location": "埼玉  UK留学してました✈",
                    "description": "ﾟ.＊97line おさらに貢いでる系女子＊.゜                                   DISH// ✯ 佐野悠斗 ✯ 読モ ✯ WEGO ✯ 嵐                                I met @OTYOfficial in the London ;)",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 111,
                    "friends_count": 121,
                    "listed_count": 0,
                    "created_at": "Thu Nov 07 09:47:41 +0000 2013",
                    "favourites_count": 321,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 1777,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501535615351926784/c5AAh6Sz_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501535615351926784/c5AAh6Sz_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2179759316/1407640217",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 14:59:49 +0000 2014",
                    "id": 505731620456771600,
                    "id_str": "505731620456771584",
                    "text": "@samao21718 \n呼び方☞まおちゃん\n呼ばれ方☞あーちゃん\n第一印象☞平野から？！\n今の印象☞おとなっぽい！！\nLINE交換☞もってるん\\( ˆoˆ )/\nトプ画について☞楽しそうでいーな😳\n家族にするなら☞おねぇちゃん\n最後に一言☞全然会えないねー今度会えたらいいな！",
                    "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": 2179759316,
                    "in_reply_to_user_id_str": "2179759316",
                    "in_reply_to_screen_name": "samao21718",
                    "user": {
                        "id": 1680668713,
                        "id_str": "1680668713",
                        "name": "★Shiiiii!☆",
                        "screen_name": "AFmbsk",
                        "location": "埼玉",
                        "description": "2310*basketball#41*UVERworld*Pooh☪Bell +.｡*弱さを知って強くなれ*ﾟ",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 429,
                        "friends_count": 434,
                        "listed_count": 0,
                        "created_at": "Sun Aug 18 12:45:00 +0000 2013",
                        "favourites_count": 2488,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 6352,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/504643170886365185/JN_dlwUd_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/504643170886365185/JN_dlwUd_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/1680668713/1408805886",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 1,
                    "favorite_count": 1,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": [
                            {
                                "screen_name": "samao21718",
                                "name": "まお",
                                "id": 2179759316,
                                "id_str": "2179759316",
                                "indices": [
                                    0,
                                    11
                                ]
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 1,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "AFmbsk",
                            "name": "★Shiiiii!☆",
                            "id": 1680668713,
                            "id_str": "1680668713",
                            "indices": [
                                3,
                                10
                            ]
                        },
                        {
                            "screen_name": "samao21718",
                            "name": "まお",
                            "id": 2179759316,
                            "id_str": "2179759316",
                            "indices": [
                                12,
                                23
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:10 +0000 2014",
                "id": 505874905712189440,
                "id_str": "505874905712189440",
                "text": "一、常に身一つ簡素にして、美食を好んではならない",
                "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1330420010,
                    "id_str": "1330420010",
                    "name": "獨行道bot",
                    "screen_name": "dokkodo_bot",
                    "location": "",
                    "description": "宮本武蔵の自誓書、「獨行道」に記された二十一箇条をランダムにつぶやくbotです。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 4,
                    "friends_count": 5,
                    "listed_count": 1,
                    "created_at": "Sat Apr 06 01:19:55 +0000 2013",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 9639,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3482551671/d9e749f7658b523bdd50b7584ed4ba6a_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3482551671/d9e749f7658b523bdd50b7584ed4ba6a_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1330420010/1365212335",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:10 +0000 2014",
                "id": 505874903094939650,
                "id_str": "505874903094939648",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/mote_danshi1\" rel=\"nofollow\">モテモテ大作戦★男子編</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2714526565,
                    "id_str": "2714526565",
                    "name": "モテモテ大作戦★男子編",
                    "screen_name": "mote_danshi1",
                    "location": "",
                    "description": "やっぱりモテモテ男子になりたい！自分を磨くヒントをみつけたい！応援してくれる人は RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 664,
                    "friends_count": 1835,
                    "listed_count": 0,
                    "created_at": "Thu Aug 07 12:59:59 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 597,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497368689386086400/7hqdKMzG_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497368689386086400/7hqdKMzG_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2714526565/1407416898",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:10 +0000 2014",
                "id": 505874902390276100,
                "id_str": "505874902390276096",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/kokoro_meigen11\" rel=\"nofollow\">心に響くアツい名言集</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2699261263,
                    "id_str": "2699261263",
                    "name": "心に響くアツい名言集",
                    "screen_name": "kokoro_meigen11",
                    "location": "",
                    "description": "人生の格言は、人の心や人生を瞬時にに動かしてしまうことがある。\r\nそんな言葉の重みを味わおう。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 183,
                    "friends_count": 1126,
                    "listed_count": 0,
                    "created_at": "Fri Aug 01 22:00:00 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 749,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495328654126112768/1rKnNuWK_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495328654126112768/1rKnNuWK_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2699261263/1406930543",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:10 +0000 2014",
                "id": 505874902247677950,
                "id_str": "505874902247677954",
                "text": "RT @POTENZA_SUPERGT: ありがとうございます！“@8CBR8: @POTENZA_SUPERGT 13時半ごろ一雨きそうですが、無事全車決勝レース完走出来ること祈ってます！ http://t.co/FzTyFnt9xH”",
                "source": "<a href=\"http://jigtwi.jp/?p=1\" rel=\"nofollow\">jigtwi</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1021030416,
                    "id_str": "1021030416",
                    "name": "narur",
                    "screen_name": "narur2",
                    "location": "晴れの国なのに何故か開幕戦では雨や雪や冰や霰が降る✨",
                    "description": "F1.GP2.Superformula.SuperGT.F3...\nスーパーGTが大好き♡車が好き！新幹線も好き！飛行機も好き！こっそり別アカです(๑´ㅂ`๑)♡*.+゜",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 257,
                    "friends_count": 237,
                    "listed_count": 2,
                    "created_at": "Wed Dec 19 01:14:41 +0000 2012",
                    "favourites_count": 547,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 55417,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/462180217574789121/1Jf6m_2L.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/462180217574789121/1Jf6m_2L.jpeg",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/444312241395863552/FKl40ebQ_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/444312241395863552/FKl40ebQ_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:05:11 +0000 2014",
                    "id": 505868866686169100,
                    "id_str": "505868866686169089",
                    "text": "ありがとうございます！“@8CBR8: @POTENZA_SUPERGT 13時半ごろ一雨きそうですが、無事全車決勝レース完走出来ること祈ってます！ http://t.co/FzTyFnt9xH”",
                    "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                    "truncated": false,
                    "in_reply_to_status_id": 505868690588303360,
                    "in_reply_to_status_id_str": "505868690588303360",
                    "in_reply_to_user_id": 333344408,
                    "in_reply_to_user_id_str": "333344408",
                    "in_reply_to_screen_name": "8CBR8",
                    "user": {
                        "id": 359324738,
                        "id_str": "359324738",
                        "name": "POTENZA_SUPERGT",
                        "screen_name": "POTENZA_SUPERGT",
                        "location": "",
                        "description": "ブリヂストンのスポーツタイヤ「POTENZA」のアカウントです。レースやタイヤの事などをつぶやきます。今シーズンも「チャンピオンタイヤの称号は譲らない」をキャッチコピーに、タイヤ供給チームを全力でサポートしていきますので、応援よろしくお願いします！なお、返信ができない場合もありますので、ご了承よろしくお願い致します。",
                        "url": "http://t.co/LruVPk5x4K",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/LruVPk5x4K",
                                        "expanded_url": "http://www.bridgestone.co.jp/sc/potenza/",
                                        "display_url": "bridgestone.co.jp/sc/potenza/",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 9612,
                        "friends_count": 308,
                        "listed_count": 373,
                        "created_at": "Sun Aug 21 11:33:38 +0000 2011",
                        "favourites_count": 26,
                        "utc_offset": -36000,
                        "time_zone": "Hawaii",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 10032,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "131516",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme14/bg.gif",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme14/bg.gif",
                        "profile_background_tile": true,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/1507885396/TW_image_normal.jpg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/1507885396/TW_image_normal.jpg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/359324738/1402546267",
                        "profile_link_color": "FF2424",
                        "profile_sidebar_border_color": "EEEEEE",
                        "profile_sidebar_fill_color": "EFEFEF",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 7,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": [
                            {
                                "screen_name": "8CBR8",
                                "name": "CBR Rider #17 KEIHIN",
                                "id": 333344408,
                                "id_str": "333344408",
                                "indices": [
                                    12,
                                    18
                                ]
                            },
                            {
                                "screen_name": "POTENZA_SUPERGT",
                                "name": "POTENZA_SUPERGT",
                                "id": 359324738,
                                "id_str": "359324738",
                                "indices": [
                                    20,
                                    36
                                ]
                            }
                        ],
                        "media": [
                            {
                                "id": 505868690252779500,
                                "id_str": "505868690252779521",
                                "indices": [
                                    75,
                                    97
                                ],
                                "media_url": "http://pbs.twimg.com/media/BwU05MGCUAEY6Wu.jpg",
                                "media_url_https": "https://pbs.twimg.com/media/BwU05MGCUAEY6Wu.jpg",
                                "url": "http://t.co/FzTyFnt9xH",
                                "display_url": "pic.twitter.com/FzTyFnt9xH",
                                "expanded_url": "http://twitter.com/8CBR8/status/505868690588303360/photo/1",
                                "type": "photo",
                                "sizes": {
                                    "medium": {
                                        "w": 600,
                                        "h": 399,
                                        "resize": "fit"
                                    },
                                    "thumb": {
                                        "w": 150,
                                        "h": 150,
                                        "resize": "crop"
                                    },
                                    "large": {
                                        "w": 1024,
                                        "h": 682,
                                        "resize": "fit"
                                    },
                                    "small": {
                                        "w": 340,
                                        "h": 226,
                                        "resize": "fit"
                                    }
                                },
                                "source_status_id": 505868690588303360,
                                "source_status_id_str": "505868690588303360"
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 7,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "POTENZA_SUPERGT",
                            "name": "POTENZA_SUPERGT",
                            "id": 359324738,
                            "id_str": "359324738",
                            "indices": [
                                3,
                                19
                            ]
                        },
                        {
                            "screen_name": "8CBR8",
                            "name": "CBR Rider #17 KEIHIN",
                            "id": 333344408,
                            "id_str": "333344408",
                            "indices": [
                                33,
                                39
                            ]
                        },
                        {
                            "screen_name": "POTENZA_SUPERGT",
                            "name": "POTENZA_SUPERGT",
                            "id": 359324738,
                            "id_str": "359324738",
                            "indices": [
                                41,
                                57
                            ]
                        }
                    ],
                    "media": [
                        {
                            "id": 505868690252779500,
                            "id_str": "505868690252779521",
                            "indices": [
                                96,
                                118
                            ],
                            "media_url": "http://pbs.twimg.com/media/BwU05MGCUAEY6Wu.jpg",
                            "media_url_https": "https://pbs.twimg.com/media/BwU05MGCUAEY6Wu.jpg",
                            "url": "http://t.co/FzTyFnt9xH",
                            "display_url": "pic.twitter.com/FzTyFnt9xH",
                            "expanded_url": "http://twitter.com/8CBR8/status/505868690588303360/photo/1",
                            "type": "photo",
                            "sizes": {
                                "medium": {
                                    "w": 600,
                                    "h": 399,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "large": {
                                    "w": 1024,
                                    "h": 682,
                                    "resize": "fit"
                                },
                                "small": {
                                    "w": 340,
                                    "h": 226,
                                    "resize": "fit"
                                }
                            },
                            "source_status_id": 505868690588303360,
                            "source_status_id_str": "505868690588303360"
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874901689851900,
                "id_str": "505874901689851904",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/danshi_honne1\" rel=\"nofollow\">ここだけの本音★男子編</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2762136439,
                    "id_str": "2762136439",
                    "name": "ここだけの本音★男子編",
                    "screen_name": "danshi_honne1",
                    "location": "",
                    "description": "思ってるけど言えない！でもホントは言いたいこと、実はいっぱいあるんです！ \r\nそんな男子の本音を、つぶやきます。 \r\nその気持わかるって人は RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 101,
                    "friends_count": 985,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 11:11:30 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 209,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503500282840354816/CEv8UMay_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503500282840354816/CEv8UMay_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2762136439/1408878822",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874900939046900,
                "id_str": "505874900939046912",
                "text": "RT @UARROW_Y: ようかい体操第一を踊る国見英 http://t.co/SXoYWH98as",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2454426158,
                    "id_str": "2454426158",
                    "name": "ぴかりん",
                    "screen_name": "gncnToktTtksg",
                    "location": "",
                    "description": "銀魂/黒バス/進撃/ハイキュー/BLEACH/うたプリ/鈴木達央さん/神谷浩史さん 気軽にフォローしてください（＾∇＾）✨",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 1274,
                    "friends_count": 1320,
                    "listed_count": 17,
                    "created_at": "Sun Apr 20 07:48:53 +0000 2014",
                    "favourites_count": 2314,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 5868,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/457788684146716672/KCOy0S75_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/457788684146716672/KCOy0S75_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2454426158/1409371302",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:45 +0000 2014",
                    "id": 505871779949051900,
                    "id_str": "505871779949051904",
                    "text": "ようかい体操第一を踊る国見英 http://t.co/SXoYWH98as",
                    "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 1261662588,
                        "id_str": "1261662588",
                        "name": "ゆう矢",
                        "screen_name": "UARROW_Y",
                        "location": "つくり出そう国影の波 広げよう国影の輪",
                        "description": "HQ!! 成人済腐女子。日常ツイート多いです。赤葦京治夢豚クソツイ含みます注意。フォローをお考えの際はプロフご一読お願い致します。FRBお気軽に",
                        "url": "http://t.co/LFX2XOzb0l",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/LFX2XOzb0l",
                                        "expanded_url": "http://twpf.jp/UARROW_Y",
                                        "display_url": "twpf.jp/UARROW_Y",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 265,
                        "friends_count": 124,
                        "listed_count": 12,
                        "created_at": "Tue Mar 12 10:42:17 +0000 2013",
                        "favourites_count": 6762,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 55946,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/502095104618663937/IzuPYx3E_normal.png",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/502095104618663937/IzuPYx3E_normal.png",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/1261662588/1408618604",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 29,
                    "favorite_count": 54,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [
                            {
                                "url": "http://t.co/SXoYWH98as",
                                "expanded_url": "http://twitter.com/UARROW_Y/status/505871779949051904/photo/1",
                                "display_url": "pic.twitter.com/SXoYWH98as",
                                "indices": [
                                    15,
                                    37
                                ]
                            }
                        ],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 29,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/SXoYWH98as",
                            "expanded_url": "http://twitter.com/UARROW_Y/status/505871779949051904/photo/1",
                            "display_url": "pic.twitter.com/SXoYWH98as",
                            "indices": [
                                29,
                                51
                            ]
                        }
                    ],
                    "user_mentions": [
                        {
                            "screen_name": "UARROW_Y",
                            "name": "ゆう矢",
                            "id": 1261662588,
                            "id_str": "1261662588",
                            "indices": [
                                3,
                                12
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874900561580000,
                "id_str": "505874900561580032",
                "text": "今日は一高と三桜（・θ・）\n光梨ちゃんに会えないかな〜",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1366375976,
                    "id_str": "1366375976",
                    "name": "ゆいの",
                    "screen_name": "yuino1006",
                    "location": "",
                    "description": "さんおう 男バスマネ2ねん（＾ω＾）",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 270,
                    "friends_count": 260,
                    "listed_count": 0,
                    "created_at": "Sat Apr 20 07:02:08 +0000 2013",
                    "favourites_count": 1384,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 5202,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505354401448349696/nxVFEQQ4_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505354401448349696/nxVFEQQ4_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1366375976/1399989379",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874899324248060,
                "id_str": "505874899324248064",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/kyoukan_aru\" rel=\"nofollow\">共感★絶対あるあるww</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2704420069,
                    "id_str": "2704420069",
                    "name": "共感★絶対あるあるww",
                    "screen_name": "kyoukan_aru",
                    "location": "",
                    "description": "みんなにもわかってもらえる、あるあるを見つけたい。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 857,
                    "friends_count": 1873,
                    "listed_count": 0,
                    "created_at": "Sun Aug 03 15:50:40 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 682,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495960812670836737/1LqkoyvU_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495960812670836737/1LqkoyvU_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2704420069/1407081298",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874898493796350,
                "id_str": "505874898493796352",
                "text": "RT @assam_house: 泉田新潟県知事は、東電の申請書提出を容認させられただけで、再稼働に必要な「同意」はまだ与えていません。今まで柏崎刈羽の再稼働を抑え続けてきた知事に、もう一踏ん張りをお願いする意見を送って下さい。全国の皆様、お願いします！\nhttp://t.co…",
                "source": "<a href=\"http://jigtwi.jp/?p=1001\" rel=\"nofollow\">jigtwi for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 960765968,
                    "id_str": "960765968",
                    "name": "さち",
                    "screen_name": "sachitaka_dears",
                    "location": "宮城県",
                    "description": "動物関連のアカウントです。サブアカウント@sachi_dears (さち ❷) もあります。『心あるものは皆、愛し愛されるために生まれてきた。そして愛情を感じながら生を全うするべきなんだ』",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 3212,
                    "friends_count": 3528,
                    "listed_count": 91,
                    "created_at": "Tue Nov 20 16:30:53 +0000 2012",
                    "favourites_count": 3180,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 146935,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3659653229/5b698df67f5d105400e9077f5ea50e91_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3659653229/5b698df67f5d105400e9077f5ea50e91_normal.png",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Tue Aug 19 11:00:53 +0000 2014",
                    "id": 501685228427964400,
                    "id_str": "501685228427964417",
                    "text": "泉田新潟県知事は、東電の申請書提出を容認させられただけで、再稼働に必要な「同意」はまだ与えていません。今まで柏崎刈羽の再稼働を抑え続けてきた知事に、もう一踏ん張りをお願いする意見を送って下さい。全国の皆様、お願いします！\nhttp://t.co/9oH5cgpy1q",
                    "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 1104771276,
                        "id_str": "1104771276",
                        "name": "アッサム山中（殺処分ゼロに一票）",
                        "screen_name": "assam_house",
                        "location": "新潟県柏崎市",
                        "description": "アッサム山中の趣味用アカ。当分の間、選挙啓発用としても使っていきます。このアカウントがアッサム山中本人のものである事は @assam_yamanaka のプロフでご確認下さい。\r\n公選法に係る表示\r\n庶民新党 #脱原発 http://t.co/96UqoCo0oU\r\nonestep.revival@gmail.com",
                        "url": "http://t.co/AEOCATaNZc",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/AEOCATaNZc",
                                        "expanded_url": "http://www.assam-house.net/",
                                        "display_url": "assam-house.net",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": [
                                    {
                                        "url": "http://t.co/96UqoCo0oU",
                                        "expanded_url": "http://blog.assam-house.net/datsu-genpatsu/index.html",
                                        "display_url": "blog.assam-house.net/datsu-genpatsu…",
                                        "indices": [
                                            110,
                                            132
                                        ]
                                    }
                                ]
                            }
                        },
                        "protected": false,
                        "followers_count": 2977,
                        "friends_count": 3127,
                        "listed_count": 64,
                        "created_at": "Sat Jan 19 22:10:13 +0000 2013",
                        "favourites_count": 343,
                        "utc_offset": 32400,
                        "time_zone": "Irkutsk",
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 18021,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/378800000067217575/e0a85b440429ff50430a41200327dcb8_normal.png",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000067217575/e0a85b440429ff50430a41200327dcb8_normal.png",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/1104771276/1408948288",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 2,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [
                            {
                                "url": "http://t.co/9oH5cgpy1q",
                                "expanded_url": "http://www.pref.niigata.lg.jp/kouhou/info.html",
                                "display_url": "pref.niigata.lg.jp/kouhou/info.ht…",
                                "indices": [
                                    111,
                                    133
                                ]
                            }
                        ],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 2,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/9oH5cgpy1q",
                            "expanded_url": "http://www.pref.niigata.lg.jp/kouhou/info.html",
                            "display_url": "pref.niigata.lg.jp/kouhou/info.ht…",
                            "indices": [
                                139,
                                140
                            ]
                        }
                    ],
                    "user_mentions": [
                        {
                            "screen_name": "assam_house",
                            "name": "アッサム山中（殺処分ゼロに一票）",
                            "id": 1104771276,
                            "id_str": "1104771276",
                            "indices": [
                                3,
                                15
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:09 +0000 2014",
                "id": 505874898468630500,
                "id_str": "505874898468630528",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/osyare_pea\" rel=\"nofollow\">おしゃれ★ペアルック</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2708607692,
                    "id_str": "2708607692",
                    "name": "おしゃれ★ペアルック",
                    "screen_name": "osyare_pea",
                    "location": "",
                    "description": "ラブラブ度がアップする、素敵なペアルックを見つけて紹介します♪ 気に入ったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 129,
                    "friends_count": 1934,
                    "listed_count": 0,
                    "created_at": "Tue Aug 05 07:09:31 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 641,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496554257676382208/Zgg0bmNu_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496554257676382208/Zgg0bmNu_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2708607692/1407222776",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:08 +0000 2014",
                "id": 505874897633951740,
                "id_str": "505874897633951745",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/love_live55\" rel=\"nofollow\">LOVE ♥ ラブライブ</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2745389137,
                    "id_str": "2745389137",
                    "name": "LOVE ♥ ラブライブ",
                    "screen_name": "love_live55",
                    "location": "",
                    "description": "とにかく「ラブライブが好きで～す♥」 \r\nラブライブファンには、たまらない内容ばかり集めています♪ \r\n気に入ったら RT & 相互フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 251,
                    "friends_count": 969,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 15:45:40 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 348,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501757482448850944/x2uPpqRx_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501757482448850944/x2uPpqRx_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745389137/1408463342",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:08 +0000 2014",
                "id": 505874896795086850,
                "id_str": "505874896795086848",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/koisurudoress\" rel=\"nofollow\">恋する♡ドレスシリーズ</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2726346560,
                    "id_str": "2726346560",
                    "name": "恋する♡ドレスシリーズ",
                    "screen_name": "koisurudoress",
                    "location": "",
                    "description": "どれもこれも、見ているだけで欲しくなっちゃう♪  \r\n特別な日に着る素敵なドレスを見つけたいです。  \r\n着てみたいと思ったら RT & フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 314,
                    "friends_count": 1900,
                    "listed_count": 0,
                    "created_at": "Tue Aug 12 14:10:35 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 471,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/499199619465621504/fg7sVusT_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/499199619465621504/fg7sVusT_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2726346560/1407853688",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:08 +0000 2014",
                "id": 505874895964626940,
                "id_str": "505874895964626944",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/doubutuzukan\" rel=\"nofollow\">胸キュン♥動物図鑑</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2759192574,
                    "id_str": "2759192574",
                    "name": "胸キュン♥動物図鑑",
                    "screen_name": "doubutuzukan",
                    "location": "",
                    "description": "ふとした表情に思わずキュンとしてしまう♪ \r\nそんな愛しの動物たちの写真を見つけます。 \r\n気に入ったら RT & フォローを、お願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 80,
                    "friends_count": 959,
                    "listed_count": 1,
                    "created_at": "Sat Aug 23 15:47:36 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 219,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503211559552688128/Ej_bixna_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503211559552688128/Ej_bixna_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2759192574/1408809101",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:08 +0000 2014",
                "id": 505874895079608300,
                "id_str": "505874895079608320",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/disney_para\" rel=\"nofollow\">ディズニー★パラダイス</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2719228561,
                    "id_str": "2719228561",
                    "name": "ディズニー★パラダイス",
                    "screen_name": "disney_para",
                    "location": "",
                    "description": "ディズニーのかわいい画像、ニュース情報、あるあるなどをお届けします♪\r\nディズニーファンは RT & フォローもお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 331,
                    "friends_count": 1867,
                    "listed_count": 0,
                    "created_at": "Sat Aug 09 12:01:32 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 540,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498076922488696832/Ti2AEuOT_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498076922488696832/Ti2AEuOT_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2719228561/1407585841",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:08 +0000 2014",
                "id": 505874894135898100,
                "id_str": "505874894135898112",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/nama_fuushi\" rel=\"nofollow\">生々しい風刺画</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2714772727,
                    "id_str": "2714772727",
                    "name": "生々しい風刺画",
                    "screen_name": "nama_fuushi",
                    "location": "",
                    "description": "深い意味が込められた「生々しい風刺画」を見つけます。\r\n考えさせられたら RT & 相互フォローでみなさん、お願いします",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 298,
                    "friends_count": 1902,
                    "listed_count": 1,
                    "created_at": "Thu Aug 07 15:04:45 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 595,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497398363352875011/tS-5FPJB_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497398363352875011/tS-5FPJB_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2714772727/1407424091",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874893347377150,
                "id_str": "505874893347377152",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/arashi_suki1\" rel=\"nofollow\">嵐★大好きっ娘</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2721682579,
                    "id_str": "2721682579",
                    "name": "嵐★大好きっ娘",
                    "screen_name": "arashi_suki1",
                    "location": "",
                    "description": "なんだかんだ言って、やっぱり嵐が好きなんです♪\r\nいろいろ集めたいので、嵐好きな人に見てほしいです。\r\n気に入ったら RT & 相互フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 794,
                    "friends_count": 1913,
                    "listed_count": 2,
                    "created_at": "Sun Aug 10 13:43:56 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 504,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498465364733198336/RO6wupdc_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498465364733198336/RO6wupdc_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2721682579/1407678436",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874893154426900,
                "id_str": "505874893154426881",
                "text": "RT @Takashi_Shiina: テレビで「成人男性のカロリー摂取量は1900kcal」とか言ってて、それはいままさに私がダイエットのために必死でキープしようとしている量で、「それが普通なら人はいつ天一やココイチに行って大盛りを食えばいいんだ！」と思った。",
                "source": "<a href=\"http://twicca.r246.jp/\" rel=\"nofollow\">twicca</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 353516742,
                    "id_str": "353516742",
                    "name": "おしんこー＠土曜西え41a",
                    "screen_name": "oshin_koko",
                    "location": "こたつ",
                    "description": "ROMって楽しんでいる部分もあり無言フォロー多めですすみません…。ツイート数多め・あらぶり多めなのでフォロー非推奨です。最近は早兵・兵部受け中心ですがBLNLなんでも好きです。地雷少ないため雑多に呟きます。腐・R18・ネタバレ有るのでご注意。他好きなジャンルはプロフ参照願います。　主催→@chounou_antholo",
                    "url": "http://t.co/mM1dG54NiO",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/mM1dG54NiO",
                                    "expanded_url": "http://twpf.jp/oshin_koko",
                                    "display_url": "twpf.jp/oshin_koko",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 479,
                    "friends_count": 510,
                    "listed_count": 43,
                    "created_at": "Fri Aug 12 05:53:13 +0000 2011",
                    "favourites_count": 3059,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 104086,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "000000",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/799871497/01583a031f83a45eba881c8acde729ee.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/799871497/01583a031f83a45eba881c8acde729ee.jpeg",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/484347196523835393/iHaYxm-2_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/484347196523835393/iHaYxm-2_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/353516742/1369039651",
                    "profile_link_color": "FF96B0",
                    "profile_sidebar_border_color": "FFFFFF",
                    "profile_sidebar_fill_color": "95E8EC",
                    "profile_text_color": "3C3940",
                    "profile_use_background_image": false,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 09:58:30 +0000 2014",
                    "id": 505655792733650940,
                    "id_str": "505655792733650944",
                    "text": "テレビで「成人男性のカロリー摂取量は1900kcal」とか言ってて、それはいままさに私がダイエットのために必死でキープしようとしている量で、「それが普通なら人はいつ天一やココイチに行って大盛りを食えばいいんだ！」と思った。",
                    "source": "<a href=\"http://janetter.net/\" rel=\"nofollow\">Janetter</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 126573583,
                        "id_str": "126573583",
                        "name": "椎名高志",
                        "screen_name": "Takashi_Shiina",
                        "location": "BABEL（超能力支援研究局）",
                        "description": "漫画家。週刊少年サンデーで『絶対可憐チルドレン』連載中。TVアニメ『THE UNLIMITED 兵部京介』公式サイト＞http://t.co/jVqBoBEc",
                        "url": "http://t.co/K3Oi83wM3w",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/K3Oi83wM3w",
                                        "expanded_url": "http://cnanews.asablo.jp/blog/",
                                        "display_url": "cnanews.asablo.jp/blog/",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": [
                                    {
                                        "url": "http://t.co/jVqBoBEc",
                                        "expanded_url": "http://unlimited-zc.jp/index.html",
                                        "display_url": "unlimited-zc.jp/index.html",
                                        "indices": [
                                            59,
                                            79
                                        ]
                                    }
                                ]
                            }
                        },
                        "protected": false,
                        "followers_count": 110756,
                        "friends_count": 61,
                        "listed_count": 8159,
                        "created_at": "Fri Mar 26 08:54:51 +0000 2010",
                        "favourites_count": 25,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 27364,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "EDECE9",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme3/bg.gif",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme3/bg.gif",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/504597210772688896/Uvt4jgf5_normal.png",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/504597210772688896/Uvt4jgf5_normal.png",
                        "profile_link_color": "088253",
                        "profile_sidebar_border_color": "D3D2CF",
                        "profile_sidebar_fill_color": "E3E2DE",
                        "profile_text_color": "634047",
                        "profile_use_background_image": false,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 221,
                    "favorite_count": 109,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 221,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "Takashi_Shiina",
                            "name": "椎名高志",
                            "id": 126573583,
                            "id_str": "126573583",
                            "indices": [
                                3,
                                18
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874892567244800,
                "id_str": "505874892567244801",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/shimo_hentai\" rel=\"nofollow\">下ネタ＆笑変態雑学</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2762581922,
                    "id_str": "2762581922",
                    "name": "下ネタ＆笑変態雑学",
                    "screen_name": "shimo_hentai",
                    "location": "",
                    "description": "普通の人には思いつかない、ちょっと変態チックな 笑える下ネタ雑学をお届けします。 \r\nおもしろかったら RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 37,
                    "friends_count": 990,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 14:13:20 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 212,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503545991950114816/K9yQbh1Q_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503545991950114816/K9yQbh1Q_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2762581922/1408889893",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874891778703360,
                "id_str": "505874891778703360",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/kantaneigo1\" rel=\"nofollow\">超簡単★初心者英語</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744544025,
                    "id_str": "2744544025",
                    "name": "超簡単★初心者英語",
                    "screen_name": "kantaneigo1",
                    "location": "",
                    "description": "すぐに使えるフレーズや簡単な会話を紹介します。 \r\n少しづつ練習して、どんどん使ってみよう☆ \r\n使ってみたいと思ったら RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 147,
                    "friends_count": 970,
                    "listed_count": 1,
                    "created_at": "Tue Aug 19 10:11:48 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 345,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501676136321929216/4MLpyHe3_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501676136321929216/4MLpyHe3_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744544025/1408443928",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874891032121340,
                "id_str": "505874891032121344",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/ima_handsign\" rel=\"nofollow\">現代のハンドサイン</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2762816814,
                    "id_str": "2762816814",
                    "name": "現代のハンドサイン",
                    "screen_name": "ima_handsign",
                    "location": "",
                    "description": "イザという時や、困った時に、必ず役に立つハンドサインのオンパレードです♪ \r\n使ってみたくなったら RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 95,
                    "friends_count": 996,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 15:33:58 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 210,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503566188253687809/7wtdp1AC_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503566188253687809/7wtdp1AC_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2762816814/1408894540",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874890247782400,
                "id_str": "505874890247782401",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/anata_iionna\" rel=\"nofollow\">今日からアナタもイイ女♪</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2714167411,
                    "id_str": "2714167411",
                    "name": "今日からアナタもイイ女♪",
                    "screen_name": "anata_iionna",
                    "location": "",
                    "description": "みんなが知りたい イイ女の秘密を見つけます♪ いいな～と思ってくれた人は RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 390,
                    "friends_count": 1425,
                    "listed_count": 0,
                    "created_at": "Thu Aug 07 09:27:59 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 609,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497314455655436288/dz7P3-fy_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497314455655436288/dz7P3-fy_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2714167411/1407404214",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874890218434560,
                "id_str": "505874890218434560",
                "text": "@kohecyan3 \n名前:上野滉平\n呼び方:うえの\n呼ばれ方:ずるかわ\n第一印象:過剰な俺イケメンですアピール\n今の印象:バーバリーの時計\n好きなところ:あの自信さ、笑いが絶えない\n一言:大学受かったの？応援してる〜(*^^*)！\n\n#RTした人にやる\nちょっとやってみる笑",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": 2591363659,
                "in_reply_to_user_id_str": "2591363659",
                "in_reply_to_screen_name": "kohecyan3",
                "user": {
                    "id": 2613282517,
                    "id_str": "2613282517",
                    "name": "K",
                    "screen_name": "kawazurukenna",
                    "location": "",
                    "description": "# I surprise even my self",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 113,
                    "friends_count": 185,
                    "listed_count": 0,
                    "created_at": "Wed Jul 09 09:39:13 +0000 2014",
                    "favourites_count": 157,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 242,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/502436858135973888/PcUU0lov_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/502436858135973888/PcUU0lov_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "RTした人にやる",
                            "indices": [
                                119,
                                128
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "kohecyan3",
                            "name": "上野滉平",
                            "id": 2591363659,
                            "id_str": "2591363659",
                            "indices": [
                                0,
                                10
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:07 +0000 2014",
                "id": 505874889392156700,
                "id_str": "505874889392156672",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/iq_tameshi\" rel=\"nofollow\">IQ★力だめし</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2709308887,
                    "id_str": "2709308887",
                    "name": "IQ★力だめし",
                    "screen_name": "iq_tameshi",
                    "location": "",
                    "description": "解けると楽しい気分になれる問題を見つけて紹介します♪面白かったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 443,
                    "friends_count": 1851,
                    "listed_count": 1,
                    "created_at": "Tue Aug 05 13:14:30 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 664,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496646485266558977/W_W--qV__normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496646485266558977/W_W--qV__normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2709308887/1407244754",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874888817532900,
                "id_str": "505874888817532928",
                "text": "第一三軍から２個師団が北へ移動中らしい　　　　　この調子では満州に陸軍兵力があふれかえる",
                "source": "<a href=\"http://m.blogs.yahoo.co.jp/misa_1273\" rel=\"nofollow\">如月克己</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1171299612,
                    "id_str": "1171299612",
                    "name": "如月 克己",
                    "screen_name": "kisaragi_katumi",
                    "location": "満州",
                    "description": "GパングのA型K月克己中尉の非公式botです。 主に七巻と八巻が中心の台詞をつぶやきます。 4/18.台詞追加しました/現在試運転中/現在軽い挨拶だけTL反応。/追加したい台詞や何おかしい所がありましたらDMやリプライで/フォロー返しは手動です/",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 65,
                    "friends_count": 63,
                    "listed_count": 0,
                    "created_at": "Tue Feb 12 08:21:38 +0000 2013",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 27219,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3242847112/0ce536444c94cbec607229022d43a27a_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3242847112/0ce536444c94cbec607229022d43a27a_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874888616181760,
                "id_str": "505874888616181760",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/tokuda_ouen1\" rel=\"nofollow\">徳田有希★応援隊</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2766021865,
                    "id_str": "2766021865",
                    "name": "徳田有希★応援隊",
                    "screen_name": "tokuda_ouen1",
                    "location": "",
                    "description": "女子中高生に大人気ww　いやされるイラストを紹介します。 \r\nみんなで RTして応援しよう～♪ \r\n「非公式アカウントです」",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 123,
                    "friends_count": 978,
                    "listed_count": 0,
                    "created_at": "Mon Aug 25 10:48:41 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 210,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503857235802333184/YS0sDN6q_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503857235802333184/YS0sDN6q_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2766021865/1408963998",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874887802511360,
                "id_str": "505874887802511361",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/fujyoshinoheya\" rel=\"nofollow\">腐女子の☆部屋</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744683982,
                    "id_str": "2744683982",
                    "name": "腐女子の☆部屋",
                    "screen_name": "fujyoshinoheya",
                    "location": "",
                    "description": "腐女子にしかわからないネタや、あるあるを見つけていきます。 \r\n他には、BL～萌えキュン系まで、腐のための画像を集めています♪ \r\n同じ境遇の人には、わかってもらえると思うので、気軽に RT & フォローお願いします☆",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 241,
                    "friends_count": 990,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 11:47:21 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 345,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501697365590306817/GLP_QH_b_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501697365590306817/GLP_QH_b_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744683982/1408448984",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874887009767400,
                "id_str": "505874887009767424",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/moe_rate\" rel=\"nofollow\">萌え芸術★ラテアート</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2763178045,
                    "id_str": "2763178045",
                    "name": "萌え芸術★ラテアート",
                    "screen_name": "moe_rate",
                    "location": "",
                    "description": "ここまで来ると、もはや芸術!! 見てるだけで楽しい♪ \r\nそんなラテアートを、とことん探します。 \r\nスゴイと思ったら RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 187,
                    "friends_count": 998,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 16:53:16 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 210,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503586151764992000/RC80it20_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503586151764992000/RC80it20_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2763178045/1408899447",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874886225448960,
                "id_str": "505874886225448960",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/zenbu_johnnys\" rel=\"nofollow\">全部★ジャニーズ図鑑</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2724158970,
                    "id_str": "2724158970",
                    "name": "全部★ジャニーズ図鑑",
                    "screen_name": "zenbu_johnnys",
                    "location": "",
                    "description": "ジャニーズのカッコイイ画像、おもしろエピソードなどを発信します。\r\n「非公式アカウントです」\r\nジャニーズ好きな人は、是非 RT ＆ フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 738,
                    "friends_count": 1838,
                    "listed_count": 0,
                    "created_at": "Mon Aug 11 15:50:08 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 556,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498859581057945600/ncMKwdvC_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498859581057945600/ncMKwdvC_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2724158970/1407772462",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874885810200600,
                "id_str": "505874885810200576",
                "text": "RT @naopisu_: 呼び方:\n呼ばれ方:\n第一印象:\n今の印象:\n好きなところ:\n家族にするなら:\n最後に一言:\n#RTした人にやる\n\nお腹痛くて寝れないからやるww\nだれでもどうぞ〜😏🙌",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2347898072,
                    "id_str": "2347898072",
                    "name": "にたにた",
                    "screen_name": "syo6660129",
                    "location": "",
                    "description": "",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 64,
                    "friends_count": 70,
                    "listed_count": 1,
                    "created_at": "Mon Feb 17 04:29:46 +0000 2014",
                    "favourites_count": 58,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 145,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/485603672118669314/73uh_xRS_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/485603672118669314/73uh_xRS_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2347898072/1396957619",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 14:19:31 +0000 2014",
                    "id": 505721480261300200,
                    "id_str": "505721480261300224",
                    "text": "呼び方:\n呼ばれ方:\n第一印象:\n今の印象:\n好きなところ:\n家族にするなら:\n最後に一言:\n#RTした人にやる\n\nお腹痛くて寝れないからやるww\nだれでもどうぞ〜😏🙌",
                    "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 856045488,
                        "id_str": "856045488",
                        "name": "なおぴす",
                        "screen_name": "naopisu_",
                        "location": "Fujino 65th ⇢ Sagaso 12A(LJK",
                        "description": "＼ もうすぐ18歳 “Only One”になる ／",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 267,
                        "friends_count": 259,
                        "listed_count": 2,
                        "created_at": "Mon Oct 01 08:36:23 +0000 2012",
                        "favourites_count": 218,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 1790,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/496321592553525249/tuzX9ByR_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/496321592553525249/tuzX9ByR_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/856045488/1407118111",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 23,
                    "favorite_count": 1,
                    "entities": {
                        "hashtags": [
                            {
                                "text": "RTした人にやる",
                                "indices": [
                                    47,
                                    56
                                ]
                            }
                        ],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 23,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "RTした人にやる",
                            "indices": [
                                61,
                                70
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "naopisu_",
                            "name": "なおぴす",
                            "id": 856045488,
                            "id_str": "856045488",
                            "indices": [
                                3,
                                12
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:06 +0000 2014",
                "id": 505874885474656260,
                "id_str": "505874885474656256",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/line_aru1\" rel=\"nofollow\">爆笑★LINE あるある</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2709561589,
                    "id_str": "2709561589",
                    "name": "爆笑★LINE あるある",
                    "screen_name": "line_aru1",
                    "location": "",
                    "description": "思わず笑ってしまうLINEでのやりとりや、あるあるを見つけたいです♪面白かったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 496,
                    "friends_count": 1875,
                    "listed_count": 1,
                    "created_at": "Tue Aug 05 15:01:30 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 687,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496673793939492867/p1BN4YaW_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496673793939492867/p1BN4YaW_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2709561589/1407251270",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874884627410940,
                "id_str": "505874884627410944",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/misawahatugen\" rel=\"nofollow\">全力★ミサワ的w発言</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2734455415,
                    "id_str": "2734455415",
                    "name": "全力★ミサワ的w発言!!",
                    "screen_name": "misawahatugen",
                    "location": "",
                    "description": "ウザすぎて笑えるミサワ的名言や、おもしろミサワ画像を集めています。　\r\nミサワを知らない人でも、いきなりツボにハマっちゃう内容をお届けします。　\r\nウザいｗと思ったら RT & 相互フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 144,
                    "friends_count": 1915,
                    "listed_count": 1,
                    "created_at": "Fri Aug 15 13:20:04 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 436,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/500271070834749444/HvengMe5_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/500271070834749444/HvengMe5_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2734455415/1408108944",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874883809521660,
                "id_str": "505874883809521664",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/otakara_sotuaru\" rel=\"nofollow\">お宝ww有名人卒アル特集</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2708183557,
                    "id_str": "2708183557",
                    "name": "お宝ww有名人卒アル特集",
                    "screen_name": "otakara_sotuaru",
                    "location": "",
                    "description": "みんな昔は若かったんですね。今からは想像もつかない、あの有名人を見つけます。\r\n面白かったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 286,
                    "friends_count": 1938,
                    "listed_count": 0,
                    "created_at": "Tue Aug 05 03:26:54 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 650,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496499121276985344/hC8RoebP_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496499121276985344/hC8RoebP_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2708183557/1407318758",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874883322970100,
                "id_str": "505874883322970112",
                "text": "レッドクリフのキャラのこと女装ってくそわろたwww朝一で面白かった( ˘ω゜)笑",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1620730616,
                    "id_str": "1620730616",
                    "name": "ひーちゃん@橘芋健ぴ",
                    "screen_name": "2nd_8hkr",
                    "location": "北の大地.95年組 ☞ 9/28.10/2(5).12/28",
                    "description": "THE SECOND/劇団EXILE/EXILE/二代目JSB ☞KENCHI.AKIRA.青柳翔.小森隼.石井杏奈☜ Big Love ♡ Respect ..... ✍ MATSU Origin✧ .た ち ば な '' い も '' け ん い ち ろ う さ んTEAM NACS 安田.戸次 Liebe !",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 109,
                    "friends_count": 148,
                    "listed_count": 0,
                    "created_at": "Thu Jul 25 16:09:29 +0000 2013",
                    "favourites_count": 783,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 9541,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/458760951060123648/Cocoxi-2_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/458760951060123648/Cocoxi-2_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1620730616/1408681982",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874883067129860,
                "id_str": "505874883067129857",
                "text": "【状態良好】ペンタックス・デジタル一眼レフカメラ・K20D 入札数=38 現在価格=15000円 http://t.co/4WK1f6V2n6終了=2014年08月31日 20:47:53 #一眼レフ http://t.co/PcSaXzfHMW",
                "source": "<a href=\"https://github.com/AKB428/YahooAuctionBot\" rel=\"nofollow\">YahooAuction Degicame</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2278053589,
                    "id_str": "2278053589",
                    "name": "AuctionCamera",
                    "screen_name": "AuctionCamera",
                    "location": "",
                    "description": "Yahooオークションのデジカメカテゴリから商品を抽出するボットです。",
                    "url": "https://t.co/3sB1NDnd0m",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "https://t.co/3sB1NDnd0m",
                                    "expanded_url": "https://github.com/AKB428/YahooAuctionBot",
                                    "display_url": "github.com/AKB428/YahooAu…",
                                    "indices": [
                                        0,
                                        23
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 5,
                    "friends_count": 24,
                    "listed_count": 0,
                    "created_at": "Sun Jan 05 20:10:56 +0000 2014",
                    "favourites_count": 1,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 199546,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/419927606146789376/vko-kd6Q_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/419927606146789376/vko-kd6Q_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "一眼レフ",
                            "indices": [
                                95,
                                100
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/4WK1f6V2n6",
                            "expanded_url": "http://atq.ck.valuecommerce.com/servlet/atq/referral?sid=2219441&pid=877510753&vcptn=auct/p/RJH492.PLqoLQQx1Jy8U9LE-&vc_url=http://page8.auctions.yahoo.co.jp/jp/auction/h192024356",
                            "display_url": "atq.ck.valuecommerce.com/servlet/atq/re…",
                            "indices": [
                                49,
                                71
                            ]
                        }
                    ],
                    "user_mentions": [],
                    "media": [
                        {
                            "id": 505874882828046340,
                            "id_str": "505874882828046336",
                            "indices": [
                                101,
                                123
                            ],
                            "media_url": "http://pbs.twimg.com/media/BwU6hpPCEAAxnpq.jpg",
                            "media_url_https": "https://pbs.twimg.com/media/BwU6hpPCEAAxnpq.jpg",
                            "url": "http://t.co/PcSaXzfHMW",
                            "display_url": "pic.twitter.com/PcSaXzfHMW",
                            "expanded_url": "http://twitter.com/AuctionCamera/status/505874883067129857/photo/1",
                            "type": "photo",
                            "sizes": {
                                "large": {
                                    "w": 600,
                                    "h": 450,
                                    "resize": "fit"
                                },
                                "medium": {
                                    "w": 600,
                                    "h": 450,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "small": {
                                    "w": 340,
                                    "h": 255,
                                    "resize": "fit"
                                }
                            }
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874882995826700,
                "id_str": "505874882995826689",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/yabai_giness\" rel=\"nofollow\">ヤバすぎる!!ギネス世界記録</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2762405780,
                    "id_str": "2762405780",
                    "name": "ヤバすぎる!!ギネス世界記録",
                    "screen_name": "yabai_giness",
                    "location": "",
                    "description": "世の中には、まだまだ知られていないスゴイ記録があるんです！ \r\nそんなギネス世界記録を見つけます☆ \r\nどんどん友達にも教えてあげてくださいねww \r\nヤバイと思ったら RT ＆ フォローを、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 36,
                    "friends_count": 985,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 13:17:03 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 210,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503531782919045121/NiIC25wL_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503531782919045121/NiIC25wL_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2762405780/1408886328",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874882870009860,
                "id_str": "505874882870009856",
                "text": "すごく面白い夢見た。魔法科高校通ってて（別に一科二科の区別ない）クラスメイトにヨセアツメ面子や赤僕の拓也がいて、学校対抗合唱コンクールが開催されたり会場入りの際他校の妨害工作受けたり、拓也が連れてきてた実が人質に取られたりとにかくてんこ盛りだった楽しかった赤僕読みたい手元にない",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 597357105,
                    "id_str": "597357105",
                    "name": "ふじよし",
                    "screen_name": "fuji_mark",
                    "location": "多摩動物公園",
                    "description": "成人腐女子",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 128,
                    "friends_count": 126,
                    "listed_count": 6,
                    "created_at": "Sat Jun 02 10:06:05 +0000 2012",
                    "favourites_count": 2842,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 10517,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "0099B9",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme4/bg.gif",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme4/bg.gif",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503553738569560065/D_JW2dCJ_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503553738569560065/D_JW2dCJ_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/597357105/1408864355",
                    "profile_link_color": "0099B9",
                    "profile_sidebar_border_color": "5ED4DC",
                    "profile_sidebar_fill_color": "95E8EC",
                    "profile_text_color": "3C3940",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874882228281340,
                "id_str": "505874882228281345",
                "text": "RT @oen_yakyu: ●継続試合（中京対崇徳）46回～　9時～\n　〈ラジオ中継〉\n　らじる★らじる→大阪放送局を選択→NHK-FM\n●決勝戦(三浦対中京or崇徳)　12時30分～\n　〈ラジオ中継〉\n　らじる★らじる→大阪放送局を選択→NHK第一\n　※神奈川の方は普通のラ…",
                "source": "<a href=\"http://twicca.r246.jp/\" rel=\"nofollow\">twicca</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 18477566,
                    "id_str": "18477566",
                    "name": "Natit（なち）＠そうだ、トップ行こう",
                    "screen_name": "natit_yso",
                    "location": "福岡市の端っこ",
                    "description": "ヤー・チャイカ。紫宝勢の末席くらいでQMAやってます。\r\n9/13（土）「九州杯」今年も宜しくお願いします！キーワードは「そうだ、トップ、行こう。」\r\nmore → http://t.co/ezuHyjF4Qy \r\n【旅の予定】9/20-22 関西 → 9/23-28 北海道ぐるり",
                    "url": "http://t.co/ll2yu78DGR",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/ll2yu78DGR",
                                    "expanded_url": "http://qma-kyushu.sakura.ne.jp/",
                                    "display_url": "qma-kyushu.sakura.ne.jp",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": [
                                {
                                    "url": "http://t.co/ezuHyjF4Qy",
                                    "expanded_url": "http://twpf.jp/natit_yso",
                                    "display_url": "twpf.jp/natit_yso",
                                    "indices": [
                                        83,
                                        105
                                    ]
                                }
                            ]
                        }
                    },
                    "protected": false,
                    "followers_count": 591,
                    "friends_count": 548,
                    "listed_count": 93,
                    "created_at": "Tue Dec 30 14:11:44 +0000 2008",
                    "favourites_count": 11676,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 130145,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "131516",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme14/bg.gif",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme14/bg.gif",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/1556202861/chibi-Leon_normal.jpg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/1556202861/chibi-Leon_normal.jpg",
                    "profile_link_color": "009999",
                    "profile_sidebar_border_color": "EEEEEE",
                    "profile_sidebar_fill_color": "EFEFEF",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 23:12:39 +0000 2014",
                    "id": 505855649196953600,
                    "id_str": "505855649196953600",
                    "text": "●継続試合（中京対崇徳）46回～　9時～\n　〈ラジオ中継〉\n　らじる★らじる→大阪放送局を選択→NHK-FM\n●決勝戦(三浦対中京or崇徳)　12時30分～\n　〈ラジオ中継〉\n　らじる★らじる→大阪放送局を選択→NHK第一\n　※神奈川の方は普通のラジオのNHK-FMでも",
                    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter Web Client</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2761692762,
                        "id_str": "2761692762",
                        "name": "三浦学苑軟式野球部応援団！",
                        "screen_name": "oen_yakyu",
                        "location": "",
                        "description": "兵庫県で開催される「もう一つの甲子園」こと全国高校軟式野球選手権大会に南関東ブロックから出場する三浦学苑軟式野球部を応援する非公式アカウントです。",
                        "url": "http://t.co/Cn1tPTsBGY",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/Cn1tPTsBGY",
                                        "expanded_url": "http://www.miura.ed.jp/index.html",
                                        "display_url": "miura.ed.jp/index.html",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 464,
                        "friends_count": 117,
                        "listed_count": 4,
                        "created_at": "Sun Aug 24 07:47:29 +0000 2014",
                        "favourites_count": 69,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 553,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/504299474445811712/zsxJUmL0_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/504299474445811712/zsxJUmL0_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2761692762/1409069337",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 7,
                    "favorite_count": 2,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 7,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "oen_yakyu",
                            "name": "三浦学苑軟式野球部応援団！",
                            "id": 2761692762,
                            "id_str": "2761692762",
                            "indices": [
                                3,
                                13
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874882110824450,
                "id_str": "505874882110824448",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/sumahoanime\" rel=\"nofollow\">スマホに密封★アニメ画像</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2725976444,
                    "id_str": "2725976444",
                    "name": "スマホに密封★アニメ画像",
                    "screen_name": "sumahoanime",
                    "location": "",
                    "description": "なんともめずらしい、いろんなキャラがスマホに閉じ込められています。 \r\nあなたのスマホにマッチする画像が見つかるかも♪  \r\n気に入ったら是非 RT ＆ フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 227,
                    "friends_count": 1918,
                    "listed_count": 0,
                    "created_at": "Tue Aug 12 11:27:54 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 527,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/499155646164393984/l5vSz5zu_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/499155646164393984/l5vSz5zu_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2725976444/1407843121",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:05 +0000 2014",
                "id": 505874881297133600,
                "id_str": "505874881297133568",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/mijika_kiken\" rel=\"nofollow\">アナタのそばの身近な危険</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2713926078,
                    "id_str": "2713926078",
                    "name": "アナタのそばの身近な危険",
                    "screen_name": "mijika_kiken",
                    "location": "",
                    "description": "知らないうちにやっている危険な行動を見つけて自分を守りましょう。 役に立つと思ったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 301,
                    "friends_count": 1871,
                    "listed_count": 0,
                    "created_at": "Thu Aug 07 07:12:50 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 644,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497279579245907968/Ftvms_HR_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497279579245907968/Ftvms_HR_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2713926078/1407395683",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:04 +0000 2014",
                "id": 505874880294682600,
                "id_str": "505874880294682624",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/ninkimono_daosy\" rel=\"nofollow\">人気者♥デイジー大好き</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2726199583,
                    "id_str": "2726199583",
                    "name": "人気者♥デイジー大好き",
                    "screen_name": "ninkimono_daosy",
                    "location": "",
                    "description": "デイジーの想いを、代わりにつぶやきます♪  \r\nデイジーのかわいい画像やグッズも大好きｗ  \r\n可愛いと思ったら RT & フォローお願いします。 \r\n「非公式アカウントです」",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 190,
                    "friends_count": 474,
                    "listed_count": 0,
                    "created_at": "Tue Aug 12 12:58:33 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 469,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/499178622494576640/EzWKdR_p_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/499178622494576640/EzWKdR_p_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2726199583/1407848478",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:04 +0000 2014",
                "id": 505874879392919550,
                "id_str": "505874879392919552",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/shiawasehanashi\" rel=\"nofollow\">幸せ話でフル充電しよう</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2721453846,
                    "id_str": "2721453846",
                    "name": "幸せ話でフル充電しようww",
                    "screen_name": "shiawasehanashi",
                    "location": "",
                    "description": "私が聞いて心に残った感動エピソードをお届けします。\r\n少しでも多くの人へ届けたいと思います。\r\nいいなと思ったら RT & フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 302,
                    "friends_count": 1886,
                    "listed_count": 0,
                    "created_at": "Sun Aug 10 12:16:25 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 508,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498444554916216832/ml8EiQka_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498444554916216832/ml8EiQka_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2721453846/1407673555",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:04 +0000 2014",
                "id": 505874879103520800,
                "id_str": "505874879103520768",
                "text": "RT @Ang_Angel73: 逢坂「くっ…僕の秘められし右目が…！」\n一同「……………。」",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2571968509,
                    "id_str": "2571968509",
                    "name": "イイヒト",
                    "screen_name": "IwiAlohomora",
                    "location": "草葉の陰",
                    "description": "大人です。気軽に絡んでくれるとうれしいです！ イラスト大好き！（≧∇≦） BF(仮）逢坂紘夢くんにお熱です！ マンガも好き♡欲望のままにつぶやきますのでご注意を。雑食♡",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 156,
                    "friends_count": 165,
                    "listed_count": 14,
                    "created_at": "Tue Jun 17 01:18:34 +0000 2014",
                    "favourites_count": 11926,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 7234,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/504990074862178304/DoBvOb9c_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/504990074862178304/DoBvOb9c_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2571968509/1409106012",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:27:01 +0000 2014",
                    "id": 505874364596621300,
                    "id_str": "505874364596621313",
                    "text": "逢坂「くっ…僕の秘められし右目が…！」\n一同「……………。」",
                    "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 1600750194,
                        "id_str": "1600750194",
                        "name": "臙脂",
                        "screen_name": "Ang_Angel73",
                        "location": "逢坂紘夢のそばに",
                        "description": "自由、気ままに。詳しくはツイプロ。アイコンはまめせろりちゃんからだよ☆～（ゝ。∂）",
                        "url": "http://t.co/kKCCwHTaph",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/kKCCwHTaph",
                                        "expanded_url": "http://twpf.jp/Ang_Angel73",
                                        "display_url": "twpf.jp/Ang_Angel73",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 155,
                        "friends_count": 154,
                        "listed_count": 10,
                        "created_at": "Wed Jul 17 11:44:31 +0000 2013",
                        "favourites_count": 2115,
                        "utc_offset": 32400,
                        "time_zone": "Irkutsk",
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 12342,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/378800000027871001/aa764602922050b22bf9ade3741367dc.jpeg",
                        "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/378800000027871001/aa764602922050b22bf9ade3741367dc.jpeg",
                        "profile_background_tile": true,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/500293786287603713/Ywyh69eG_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/500293786287603713/Ywyh69eG_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/1600750194/1403879183",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "FFFFFF",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 2,
                    "favorite_count": 2,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 2,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "Ang_Angel73",
                            "name": "臙脂",
                            "id": 1600750194,
                            "id_str": "1600750194",
                            "indices": [
                                3,
                                15
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:04 +0000 2014",
                "id": 505874877933314050,
                "id_str": "505874877933314048",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/honne_jyoshi1\" rel=\"nofollow\">秘密の本音♥女子編</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2762237088,
                    "id_str": "2762237088",
                    "name": "秘密の本音♥女子編",
                    "screen_name": "honne_jyoshi1",
                    "location": "",
                    "description": "普段は言えない「お・ん・なの建前と本音」をつぶやきます。 気になる あの人の本音も、わかるかも!? \r\nわかるって人は RT ＆ フォローを、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 123,
                    "friends_count": 988,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 12:27:07 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 211,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503519190364332032/BVjS_XBD_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503519190364332032/BVjS_XBD_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2762237088/1408883328",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:04 +0000 2014",
                "id": 505874877148958700,
                "id_str": "505874877148958721",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/bi_iroenpitu\" rel=\"nofollow\">美し過ぎる★色鉛筆アート</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2740047343,
                    "id_str": "2740047343",
                    "name": "美し過ぎる★色鉛筆アート",
                    "screen_name": "bi_iroenpitu",
                    "location": "",
                    "description": "ほんとにコレ色鉛筆なの～？ \r\n本物と見間違える程のリアリティを御覧ください。 \r\n気に入ったら RT & 相互フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 321,
                    "friends_count": 1990,
                    "listed_count": 0,
                    "created_at": "Sun Aug 17 16:15:05 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 396,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501039950972739585/isigil4V_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501039950972739585/isigil4V_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2740047343/1408292283",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874876465295360,
                "id_str": "505874876465295361",
                "text": "【H15-9-4】道路を利用する利益は反射的利益であり、建築基準法に基づいて道路一の指定がなされている私道の敷地所有者に対し、通行妨害行為の排除を求める人格的権利を認めることはできない。→誤。",
                "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1886570281,
                    "id_str": "1886570281",
                    "name": "行政法過去問",
                    "screen_name": "gyosei_goukaku",
                    "location": "",
                    "description": "行政書士の本試験問題の過去問（行政法分野）をランダムにつぶやきます。問題は随時追加中です。基本的に相互フォローします。※140字制限の都合上、表現は一部変えてあります。解説も文字数が可能であればなるべく…。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 1554,
                    "friends_count": 1772,
                    "listed_count": 12,
                    "created_at": "Fri Sep 20 13:24:29 +0000 2013",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 14565,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/378800000487791870/0e45e3c089c6b641cdd8d1b6f1ceb8a4_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000487791870/0e45e3c089c6b641cdd8d1b6f1ceb8a4_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874876318511100,
                "id_str": "505874876318511104",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/kgoehassou\" rel=\"nofollow\">K点越えの発想力!!</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744863153,
                    "id_str": "2744863153",
                    "name": "K点越えの発想力!!",
                    "screen_name": "kgoehassou",
                    "location": "",
                    "description": "いったいどうやったら、その領域にたどりつけるのか！？ \r\nそんな思わず笑ってしまう別世界の発想力をお届けします♪ \r\nおもしろかったら RT & 相互フォローで、お願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 76,
                    "friends_count": 957,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 13:00:08 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 341,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501715651686178816/Fgpe0B8M_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501715651686178816/Fgpe0B8M_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744863153/1408453328",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874875521581060,
                "id_str": "505874875521581056",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/ketueki_sinjitu\" rel=\"nofollow\">血液型の真実２</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2698625690,
                    "id_str": "2698625690",
                    "name": "血液型の真実",
                    "screen_name": "ketueki_sinjitu",
                    "location": "",
                    "description": "やっぱりそうだったのか～♪\r\n意外な、あの人の裏側を見つけます。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 193,
                    "friends_count": 1785,
                    "listed_count": 1,
                    "created_at": "Fri Aug 01 16:11:40 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 769,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495241446706790400/h_0DSFPG_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495241446706790400/h_0DSFPG_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2698625690/1406911319",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874874712072200,
                "id_str": "505874874712072192",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/yahari_kamiga\" rel=\"nofollow\">やっぱり神が？？を作る時</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2714868440,
                    "id_str": "2714868440",
                    "name": "やっぱり神が？？を作る時",
                    "screen_name": "yahari_kamiga",
                    "location": "",
                    "description": "やっぱり今日も、神は何かを作ろうとしています　笑。　どうやって作っているのかわかったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 243,
                    "friends_count": 1907,
                    "listed_count": 0,
                    "created_at": "Thu Aug 07 16:12:33 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 590,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497416102108884992/NRMEbKaT_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497416102108884992/NRMEbKaT_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2714868440/1407428237",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874874275864600,
                "id_str": "505874874275864576",
                "text": "RT @takuramix: 福島第一原発の構内地図がこちら。\nhttp://t.co/ZkU4TZCGPG\nどう見ても、１号機。\nRT @Lightworker19: 【大拡散】　 福島第一原発　４号機　爆発動画　40秒～ 　http://t.co/lmlgp38fgZ",
                "source": "<a href=\"http://twitter.softama.com/\" rel=\"nofollow\">ツイタマ</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 62525372,
                    "id_str": "62525372",
                    "name": "NANCY-MOON☆ひよこちゃん☆",
                    "screen_name": "nancy_moon_703",
                    "location": "JAPAN",
                    "description": "【無断転載禁止･コピペ禁止・非公式RT禁止】【必読！】⇒ http://t.co/nuUvfUVD 今現在活動中の東方神起YUNHO＆CHANGMINの2人を全力で応援しています!!(^_-)-☆ ※東方神起及びYUNHO＆CHANGMINを応援していない方・鍵付ユーザーのフォローお断り！",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": [
                                {
                                    "url": "http://t.co/nuUvfUVD",
                                    "expanded_url": "http://goo.gl/SrGLb",
                                    "display_url": "goo.gl/SrGLb",
                                    "indices": [
                                        29,
                                        49
                                    ]
                                }
                            ]
                        }
                    },
                    "protected": false,
                    "followers_count": 270,
                    "friends_count": 328,
                    "listed_count": 4,
                    "created_at": "Mon Aug 03 14:22:24 +0000 2009",
                    "favourites_count": 3283,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 180310,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "642D8B",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/470849781397336064/ltM6EdFn.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/470849781397336064/ltM6EdFn.jpeg",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3699005246/9ba2e306518d296b68b7cbfa5e4ce4e6_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3699005246/9ba2e306518d296b68b7cbfa5e4ce4e6_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/62525372/1401094223",
                    "profile_link_color": "FF0000",
                    "profile_sidebar_border_color": "FFFFFF",
                    "profile_sidebar_fill_color": "F065A8",
                    "profile_text_color": "080808",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 21:21:33 +0000 2014",
                    "id": 505827689660313600,
                    "id_str": "505827689660313600",
                    "text": "福島第一原発の構内地図がこちら。\nhttp://t.co/ZkU4TZCGPG\nどう見ても、１号機。\nRT @Lightworker19: 【大拡散】　 福島第一原発　４号機　爆発動画　40秒～ 　http://t.co/lmlgp38fgZ",
                    "source": "<a href=\"https://about.twitter.com/products/tweetdeck\" rel=\"nofollow\">TweetDeck</a>",
                    "truncated": false,
                    "in_reply_to_status_id": 505774460910043140,
                    "in_reply_to_status_id_str": "505774460910043136",
                    "in_reply_to_user_id": 238157843,
                    "in_reply_to_user_id_str": "238157843",
                    "in_reply_to_screen_name": "Lightworker19",
                    "user": {
                        "id": 29599253,
                        "id_str": "29599253",
                        "name": "タクラミックス",
                        "screen_name": "takuramix",
                        "location": "i7",
                        "description": "私の機能一覧：歌う、演劇、ネットワークエンジニア、ライター、プログラマ、翻訳、シルバーアクセサリ、……何をやってる人かは良くわからない人なので、「機能」が欲しい人は私にがっかりするでしょう。私って人間に御用があるなら別ですが。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 5136,
                        "friends_count": 724,
                        "listed_count": 335,
                        "created_at": "Wed Apr 08 01:10:58 +0000 2009",
                        "favourites_count": 21363,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 70897,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/2049751947/takuramix1204_normal.jpg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/2049751947/takuramix1204_normal.jpg",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 1,
                    "favorite_count": 1,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [
                            {
                                "url": "http://t.co/ZkU4TZCGPG",
                                "expanded_url": "http://www.tepco.co.jp/nu/fukushima-np/review/images/review1_01.gif",
                                "display_url": "tepco.co.jp/nu/fukushima-n…",
                                "indices": [
                                    17,
                                    39
                                ]
                            },
                            {
                                "url": "http://t.co/lmlgp38fgZ",
                                "expanded_url": "http://youtu.be/gDXEhyuVSDk",
                                "display_url": "youtu.be/gDXEhyuVSDk",
                                "indices": [
                                    99,
                                    121
                                ]
                            }
                        ],
                        "user_mentions": [
                            {
                                "screen_name": "Lightworker19",
                                "name": "Lightworker",
                                "id": 238157843,
                                "id_str": "238157843",
                                "indices": [
                                    54,
                                    68
                                ]
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 1,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/ZkU4TZCGPG",
                            "expanded_url": "http://www.tepco.co.jp/nu/fukushima-np/review/images/review1_01.gif",
                            "display_url": "tepco.co.jp/nu/fukushima-n…",
                            "indices": [
                                32,
                                54
                            ]
                        },
                        {
                            "url": "http://t.co/lmlgp38fgZ",
                            "expanded_url": "http://youtu.be/gDXEhyuVSDk",
                            "display_url": "youtu.be/gDXEhyuVSDk",
                            "indices": [
                                114,
                                136
                            ]
                        }
                    ],
                    "user_mentions": [
                        {
                            "screen_name": "takuramix",
                            "name": "タクラミックス",
                            "id": 29599253,
                            "id_str": "29599253",
                            "indices": [
                                3,
                                13
                            ]
                        },
                        {
                            "screen_name": "Lightworker19",
                            "name": "Lightworker",
                            "id": 238157843,
                            "id_str": "238157843",
                            "indices": [
                                69,
                                83
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874873961308160,
                "id_str": "505874873961308160",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/anayuki_suki\" rel=\"nofollow\">やっぱりアナ雪が好き♥</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2714052962,
                    "id_str": "2714052962",
                    "name": "やっぱりアナ雪が好き♥",
                    "screen_name": "anayuki_suki",
                    "location": "",
                    "description": "なんだかんだ言ってもやっぱりアナ雪が好きなんですよね～♪ \r\n私も好きって人は RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 368,
                    "friends_count": 1826,
                    "listed_count": 1,
                    "created_at": "Thu Aug 07 08:29:13 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 670,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/497299646662705153/KMo3gkv7_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/497299646662705153/KMo3gkv7_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2714052962/1407400477",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "zh"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874873759977500,
                "id_str": "505874873759977473",
                "text": "四川盆地江淮等地将有强降雨 开学日多地将有雨: 　　中新网8月31日电 据中央气象台消息，江淮东部、四川盆地东北部等地今天(31日)又将迎来一场暴雨或大暴雨天气。明天9月1日，是中小学生开学的日子。预计明天，内蒙古中部、... http://t.co/toQgVlXPyH",
                "source": "<a href=\"http://twitterfeed.com\" rel=\"nofollow\">twitterfeed</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2281979863,
                    "id_str": "2281979863",
                    "name": "News 24h China",
                    "screen_name": "news24hchn",
                    "location": "",
                    "description": "",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 719,
                    "friends_count": 807,
                    "listed_count": 7,
                    "created_at": "Wed Jan 08 10:56:04 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": 7200,
                    "time_zone": "Amsterdam",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 94782,
                    "lang": "it",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/452558963754561536/QPID3isM.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/452558963754561536/QPID3isM.jpeg",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/439031926569979904/SlBH9iMg_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/439031926569979904/SlBH9iMg_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2281979863/1393508427",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "FFFFFF",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/toQgVlXPyH",
                            "expanded_url": "http://news24h.allnews24h.com/FX54",
                            "display_url": "news24h.allnews24h.com/FX54",
                            "indices": [
                                114,
                                136
                            ]
                        }
                    ],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "zh"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874873248268300,
                "id_str": "505874873248268288",
                "text": "@Take3carnifex それは大変！一大事！命に関わります！\n是非うちに受診して下さい！",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": 505874353716600800,
                "in_reply_to_status_id_str": "505874353716600832",
                "in_reply_to_user_id": 535179785,
                "in_reply_to_user_id_str": "535179785",
                "in_reply_to_screen_name": "Take3carnifex",
                "user": {
                    "id": 226897125,
                    "id_str": "226897125",
                    "name": "ひかり＠hack",
                    "screen_name": "hikari_thirteen",
                    "location": "",
                    "description": "hackというバンドで、ギターを弾いています。 モンハンとポケモンが好き。 \nSPRING WATER リードギター(ヘルプ)\nROCK OUT レギュラーDJ",
                    "url": "http://t.co/SQLZnvjVxB",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/SQLZnvjVxB",
                                    "expanded_url": "http://s.ameblo.jp/hikarihikarimay",
                                    "display_url": "s.ameblo.jp/hikarihikarimay",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 296,
                    "friends_count": 348,
                    "listed_count": 3,
                    "created_at": "Wed Dec 15 10:51:51 +0000 2010",
                    "favourites_count": 33,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 3293,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "131516",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme14/bg.gif",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme14/bg.gif",
                    "profile_background_tile": true,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/378800000504584690/8ccba98eda8c0fd1d15a74e401f621d1_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000504584690/8ccba98eda8c0fd1d15a74e401f621d1_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/226897125/1385551752",
                    "profile_link_color": "009999",
                    "profile_sidebar_border_color": "EEEEEE",
                    "profile_sidebar_fill_color": "EFEFEF",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "Take3carnifex",
                            "name": "Take3",
                            "id": 535179785,
                            "id_str": "535179785",
                            "indices": [
                                0,
                                14
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:03 +0000 2014",
                "id": 505874873223110660,
                "id_str": "505874873223110656",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/imadokijoshiko\" rel=\"nofollow\">今どき女子高生の謎w</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744236873,
                    "id_str": "2744236873",
                    "name": "今どき女子高生の謎w",
                    "screen_name": "imadokijoshiko",
                    "location": "",
                    "description": "思わず耳を疑う男性の方の夢を壊してしまう、\r\n女子高生達のディープな世界を見てください☆  \r\nおもしろいと思ったら RT & 相互フォローでお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 79,
                    "friends_count": 973,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 07:06:47 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 354,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501627015980535808/avWBgkDh_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501627015980535808/avWBgkDh_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744236873/1408432455",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874872463925250,
                "id_str": "505874872463925248",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/risou_dansei\" rel=\"nofollow\">私の理想の男性像</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2761782601,
                    "id_str": "2761782601",
                    "name": "私の理想の男性像",
                    "screen_name": "risou_dansei",
                    "location": "",
                    "description": "こんな男性♥ ほんとにいるのかしら!? \r\n「いたらいいのになぁ」っていう理想の男性像をを、私目線でつぶやきます。 \r\nいいなと思った人は RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 69,
                    "friends_count": 974,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 08:03:32 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 208,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503452833719410688/tFU509Yk_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503452833719410688/tFU509Yk_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2761782601/1408867519",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874871713157100,
                "id_str": "505874871713157120",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/gekiatu_6byou\" rel=\"nofollow\">激アツ★6秒動画</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2725690658,
                    "id_str": "2725690658",
                    "name": "激アツ★6秒動画",
                    "screen_name": "gekiatu_6byou",
                    "location": "",
                    "description": "話題の６秒動画！ \r\n思わず「ほんとかよっ」てツッコんでしまう内容のオンパレード！ \r\nおもしろかったら、是非 RT ＆ フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 195,
                    "friends_count": 494,
                    "listed_count": 0,
                    "created_at": "Tue Aug 12 08:17:29 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 477,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/499107997444886528/3rl6FrIk_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/499107997444886528/3rl6FrIk_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2725690658/1407832963",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874871616671740,
                "id_str": "505874871616671744",
                "text": "爆笑ｗｗ珍解答集！\n先生のツメの甘さと生徒のセンスを感じる一問一答だとFBでも話題！！\nうどん天下一決定戦ウィンドウズ9三重高校竹内由恵アナ花火保険\nhttp://t.co/jRWJt8IrSB http://t.co/okrAoxSbt0",
                "source": "<a href=\"https://twitter.com/waraeru_kan\" rel=\"nofollow\">笑える博物館</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2748747362,
                    "id_str": "2748747362",
                    "name": "笑える博物館",
                    "screen_name": "waraeru_kan",
                    "location": "",
                    "description": "",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 19,
                    "friends_count": 10,
                    "listed_count": 0,
                    "created_at": "Wed Aug 20 11:11:04 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 15137,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://abs.twimg.com/sticky/default_profile_images/default_profile_4_normal.png",
                    "profile_image_url_https": "https://abs.twimg.com/sticky/default_profile_images/default_profile_4_normal.png",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": true,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/jRWJt8IrSB",
                            "expanded_url": "http://bit.ly/1qBa1nl",
                            "display_url": "bit.ly/1qBa1nl",
                            "indices": [
                                75,
                                97
                            ]
                        }
                    ],
                    "user_mentions": [],
                    "media": [
                        {
                            "id": 505874871344066560,
                            "id_str": "505874871344066560",
                            "indices": [
                                98,
                                120
                            ],
                            "media_url": "http://pbs.twimg.com/media/BwU6g-dCcAALxAW.png",
                            "media_url_https": "https://pbs.twimg.com/media/BwU6g-dCcAALxAW.png",
                            "url": "http://t.co/okrAoxSbt0",
                            "display_url": "pic.twitter.com/okrAoxSbt0",
                            "expanded_url": "http://twitter.com/waraeru_kan/status/505874871616671744/photo/1",
                            "type": "photo",
                            "sizes": {
                                "small": {
                                    "w": 340,
                                    "h": 425,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "large": {
                                    "w": 600,
                                    "h": 750,
                                    "resize": "fit"
                                },
                                "medium": {
                                    "w": 600,
                                    "h": 750,
                                    "resize": "fit"
                                }
                            }
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874871268540400,
                "id_str": "505874871268540416",
                "text": "@nasan_arai \n名前→なーさん\n第一印象→誰。(´･_･`)\n今の印象→れいら♡\nLINE交換できる？→してる(｢･ω･)｢\n好きなところ→可愛い優しい優しい優しい\n最後に一言→なーさん好き〜(´･_･`)♡GEM現場おいでね(´･_･`)♡\n\n#ふぁぼした人にやる",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": 1717603286,
                "in_reply_to_user_id_str": "1717603286",
                "in_reply_to_screen_name": "nasan_arai",
                "user": {
                    "id": 2417626784,
                    "id_str": "2417626784",
                    "name": "✩.ゆきଘ(*´꒳`)",
                    "screen_name": "Ymaaya_gem",
                    "location": "",
                    "description": "⁽⁽٩( ᐖ )۶⁾⁾ ❤︎ 武 田 舞 彩 ❤︎ ₍₍٩( ᐛ )۶₎₎",
                    "url": "http://t.co/wR0Qb76TbB",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/wR0Qb76TbB",
                                    "expanded_url": "http://twpf.jp/Ymaaya_gem",
                                    "display_url": "twpf.jp/Ymaaya_gem",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 198,
                    "friends_count": 245,
                    "listed_count": 1,
                    "created_at": "Sat Mar 29 16:03:06 +0000 2014",
                    "favourites_count": 3818,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": true,
                    "verified": false,
                    "statuses_count": 8056,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505516858816987136/4gFGjHzu_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505516858816987136/4gFGjHzu_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2417626784/1407764793",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "ふぁぼした人にやる",
                            "indices": [
                                128,
                                138
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "nasan_arai",
                            "name": "なーさん",
                            "id": 1717603286,
                            "id_str": "1717603286",
                            "indices": [
                                0,
                                11
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874871218225150,
                "id_str": "505874871218225152",
                "text": "\"ソードマスター\"剣聖カミイズミ (CV:緑川光)-「ソードマスター」のアスタリスク所持者\n第一師団団長にして「剣聖」の称号を持つ剣士。イデアの剣の師匠。 \n敵味方からも尊敬される一流の武人。",
                "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1435517814,
                    "id_str": "1435517814",
                    "name": "俺、関係ないよ？",
                    "screen_name": "BDFF_LOVE",
                    "location": "ルクセンダルクorリングアベルさんの隣",
                    "description": "自分なりに生きる人、最後まであきらめないの。でも、フォローありがとう…。@ringo_BDFFLOVE ←は、妹です。時々、会話します。「現在BOTで、BDFFのこと呟くよ！」夜は、全滅　「BDFFプレイ中」詳しくは、ツイプロみてください！(絶対)",
                    "url": "http://t.co/5R4dzpbWX2",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/5R4dzpbWX2",
                                    "expanded_url": "http://twpf.jp/BDFF_LOVE",
                                    "display_url": "twpf.jp/BDFF_LOVE",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 1066,
                    "friends_count": 1799,
                    "listed_count": 6,
                    "created_at": "Fri May 17 12:33:23 +0000 2013",
                    "favourites_count": 1431,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": true,
                    "verified": false,
                    "statuses_count": 6333,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505696320380612608/qvaxb_zx_normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505696320380612608/qvaxb_zx_normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1435517814/1409401948",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874871130136600,
                "id_str": "505874871130136576",
                "text": "闇「リンと付き合うに当たって歳の差以外にもいろいろ壁があったんだよ。愛し隊の妨害とか風紀厨の生徒会長とか…」\n一号「リンちゃんを泣かせたらシメるかんね！」\n二号「リンちゃんにやましい事したら×す…」\n執行部「不純な交際は僕が取り締まろうじゃないか…」\n闇「（消される）」",
                "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2386208737,
                    "id_str": "2386208737",
                    "name": "闇未来Bot",
                    "screen_name": "StxRinFbot",
                    "location": "DIVAルーム",
                    "description": "ProjectDIVAのモジュール・ストレンジダーク×鏡音リンFutureStyleの自己満足非公式Bot　マセレン仕様。CP要素あります。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 7,
                    "friends_count": 2,
                    "listed_count": 0,
                    "created_at": "Thu Mar 13 02:58:09 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 4876,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/443948925351755776/6rmljL5C_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/443948925351755776/6rmljL5C_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2386208737/1396259004",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874870933016600,
                "id_str": "505874870933016576",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/suitestengoku\" rel=\"nofollow\">絶品!!スイーツ天国</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2725681663,
                    "id_str": "2725681663",
                    "name": "絶品!!スイーツ天国",
                    "screen_name": "suitestengoku",
                    "location": "",
                    "description": "美味しそうなスイーツって、見てるだけで幸せな気分になれますね♪\r\nそんな素敵なスイーツに出会いたいです。\r\n食べたいと思ったら是非 RT ＆ フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 401,
                    "friends_count": 1877,
                    "listed_count": 1,
                    "created_at": "Tue Aug 12 07:43:52 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 554,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/499099533507178496/g5dNpArt_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/499099533507178496/g5dNpArt_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2725681663/1407829743",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874870148669440,
                "id_str": "505874870148669440",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/dengeki_omoro\" rel=\"nofollow\">電車厳禁!!おもしろ話</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2699667800,
                    "id_str": "2699667800",
                    "name": "電車厳禁!!おもしろ話w",
                    "screen_name": "dengeki_omoro",
                    "location": "",
                    "description": "日常のオモシロくて笑える場面を探します♪\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 461,
                    "friends_count": 1919,
                    "listed_count": 0,
                    "created_at": "Sat Aug 02 02:16:32 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 728,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495400387961036800/BBMb_hcG_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495400387961036800/BBMb_hcG_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2699667800/1406947654",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874869339189250,
                "id_str": "505874869339189249",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/ketueki_face\" rel=\"nofollow\">笑えるwwランキング2</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2695745652,
                    "id_str": "2695745652",
                    "name": "笑えるwwランキング",
                    "screen_name": "wara_runk",
                    "location": "",
                    "description": "知ってると使えるランキングを探そう。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 314,
                    "friends_count": 1943,
                    "listed_count": 1,
                    "created_at": "Thu Jul 31 13:51:57 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 737,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/494844659856728064/xBQfnm5J_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/494844659856728064/xBQfnm5J_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2695745652/1406815103",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:02 +0000 2014",
                "id": 505874868533854200,
                "id_str": "505874868533854209",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/sunikar_daisuki\" rel=\"nofollow\">スニーカー大好き★図鑑</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2707963890,
                    "id_str": "2707963890",
                    "name": "スニーカー大好き★図鑑",
                    "screen_name": "sunikar_daisuki",
                    "location": "",
                    "description": "スニーカー好きを見つけて仲間になろう♪\r\n気に入ったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 394,
                    "friends_count": 1891,
                    "listed_count": 0,
                    "created_at": "Tue Aug 05 01:54:28 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 642,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496474952631996416/f0C_u3_u_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496474952631996416/f0C_u3_u_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2707963890/1407203869",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "zh"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874867997380600,
                "id_str": "505874867997380608",
                "text": "\"@BelloTexto: ¿Quieres ser feliz? \n一\"No stalkees\" \n一\"No stalkees\" \n一\"No stalkees\" \n一\"No stalkees\" \n一\"No stalkees\" \n一\"No stalkees\".\"",
                "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2249378935,
                    "id_str": "2249378935",
                    "name": "Maggie Becerril ",
                    "screen_name": "maggdesie",
                    "location": "",
                    "description": "cambiando la vida de las personas.",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 120,
                    "friends_count": 391,
                    "listed_count": 0,
                    "created_at": "Mon Dec 16 21:56:49 +0000 2013",
                    "favourites_count": 314,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 1657,
                    "lang": "es",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505093371665604608/K0x_LV2y_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505093371665604608/K0x_LV2y_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2249378935/1409258479",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "BelloTexto",
                            "name": "Indirectas... ✉",
                            "id": 833083404,
                            "id_str": "833083404",
                            "indices": [
                                1,
                                12
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "zh"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874867720183800,
                "id_str": "505874867720183808",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/iseiuragao\" rel=\"nofollow\">ザ・異性の裏の顔</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2719746578,
                    "id_str": "2719746578",
                    "name": "ザ・異性の裏の顔",
                    "screen_name": "iseiuragao",
                    "location": "",
                    "description": "異性について少し学ぶことで、必然的にモテるようになる！？　相手を理解することで見えてくるもの「それは・・・●●」　いい内容だと思ったら RT & フォローもお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 238,
                    "friends_count": 1922,
                    "listed_count": 0,
                    "created_at": "Sat Aug 09 17:18:43 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 532,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498157077726900224/tW8q4di__normal.png",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498157077726900224/tW8q4di__normal.png",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2719746578/1407604947",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874866910687200,
                "id_str": "505874866910687233",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/bijyoalbum\" rel=\"nofollow\">超w美女☆アルバム</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744054334,
                    "id_str": "2744054334",
                    "name": "超w美女☆アルバム",
                    "screen_name": "bijyoalbum",
                    "location": "",
                    "description": "「おお～っ！いいね～」って、思わず言ってしまう、美女を見つけます☆ \r\nタイプだと思ったら RT & 相互フォローでお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 45,
                    "friends_count": 966,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 05:36:48 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 352,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501604413312491520/GP66eKWr_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501604413312491520/GP66eKWr_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744054334/1408426814",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874866105376800,
                "id_str": "505874866105376769",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/jyoshiuraseitai\" rel=\"nofollow\">男に見せない女子の裏生態</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744261238,
                    "id_str": "2744261238",
                    "name": "男に見せない女子の裏生態",
                    "screen_name": "jyoshiuraseitai",
                    "location": "",
                    "description": "男の知らない女子ならではのあるある☆ \r\nそんな生々しい女子の生態をつぶやきます。 \r\nわかる～って人は RT & フォローでお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 203,
                    "friends_count": 967,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 08:01:28 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 348,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501641354804346880/Uh1-n1LD_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501641354804346880/Uh1-n1LD_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744261238/1408435630",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874865354584060,
                "id_str": "505874865354584064",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/soubutu_seitai\" rel=\"nofollow\">驚きの動物たちの生態</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2759403146,
                    "id_str": "2759403146",
                    "name": "驚きの動物たちの生態",
                    "screen_name": "soubutu_seitai",
                    "location": "",
                    "description": "「おお～っ」と 言われるような、動物の生態をツイートします♪ \r\n知っていると、あなたも人気者に!? \r\nおもしろかったら RT & フォローを、お願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 67,
                    "friends_count": 954,
                    "listed_count": 0,
                    "created_at": "Sat Aug 23 16:39:31 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 219,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503220468128567296/Z8mGDIBS_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503220468128567296/Z8mGDIBS_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2759403146/1408812130",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:01 +0000 2014",
                "id": 505874864603820000,
                "id_str": "505874864603820032",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/mote_woman\" rel=\"nofollow\">モテ女子★ファションの秘密</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2706659820,
                    "id_str": "2706659820",
                    "name": "モテ女子★ファションの秘密",
                    "screen_name": "mote_woman",
                    "location": "",
                    "description": "オシャレかわいい♥モテ度UPの注目アイテムを見つけます。\r\n気に入ったら RT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 217,
                    "friends_count": 1806,
                    "listed_count": 0,
                    "created_at": "Mon Aug 04 14:30:24 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 682,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496303370936668161/s7xP8rTy_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496303370936668161/s7xP8rTy_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2706659820/1407163059",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874863874007040,
                "id_str": "505874863874007040",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/danjyonotigai1\" rel=\"nofollow\">男女の違いを解明する</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2761896468,
                    "id_str": "2761896468",
                    "name": "男女の違いを解明する",
                    "screen_name": "danjyonotigai1",
                    "location": "",
                    "description": "意外と理解できていない男女それぞれの事情。 \r\n「えっ　マジで!?」と驚くような、男女の習性をつぶやきます♪ ためになったら、是非 RT ＆ フォローで、お願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 82,
                    "friends_count": 992,
                    "listed_count": 0,
                    "created_at": "Sun Aug 24 09:47:44 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 237,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503479057380413441/zDLu5Z9o_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503479057380413441/zDLu5Z9o_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2761896468/1408873803",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874862900924400,
                "id_str": "505874862900924416",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/kamihassou\" rel=\"nofollow\">神レベル★極限の発想</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744950735,
                    "id_str": "2744950735",
                    "name": "神レベル★極限の発想",
                    "screen_name": "kamihassou",
                    "location": "",
                    "description": "見ているだけで、本気がビシバシ伝わってきます！ \r\n人生のヒントになるような、そんな究極の発想を集めています。 \r\nいいなと思ったら RT & 相互フォローで、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 84,
                    "friends_count": 992,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 13:36:05 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 343,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501725053189226496/xZNOTYz2_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501725053189226496/xZNOTYz2_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744950735/1408455571",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874862397591550,
                "id_str": "505874862397591552",
                "text": "@kaoritoxx そうよ！あたしはそう思うようにしておる。いま職場一やけとる気がする(°_°)！満喫幸せ焼け！！wあー、なるほどね！毎回そうだよね！ティアラちゃんみにいってるもんね♡五月と九月恐ろしい、、、\nハリポタエリアはいった？？",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": 505838547308277760,
                "in_reply_to_status_id_str": "505838547308277761",
                "in_reply_to_user_id": 796000214,
                "in_reply_to_user_id_str": "796000214",
                "in_reply_to_screen_name": "kaoritoxx",
                "user": {
                    "id": 2256249487,
                    "id_str": "2256249487",
                    "name": "はあちゃん@海賊同盟中",
                    "screen_name": "onepiece_24",
                    "location": "どえすえろぉたんの助手兼ね妹(願望)",
                    "description": "ONE PIECE愛しすぎて今年２３ちゃい(歴１４年目)ゾロ様に一途だったのにロー、このやろー。ロビンちゃんが幸せになればいい。ルフィは無条件にすき。ゾロビン、ローロビ、ルロビ♡usj、声優さん、コナン、進撃、クレしん、H x Hも好き♩",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 415,
                    "friends_count": 384,
                    "listed_count": 3,
                    "created_at": "Sat Dec 21 09:37:25 +0000 2013",
                    "favourites_count": 1603,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 9636,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501686340564418561/hMQFN4vD_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501686340564418561/hMQFN4vD_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2256249487/1399987924",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "kaoritoxx",
                            "name": "かおちゃん",
                            "id": 796000214,
                            "id_str": "796000214",
                            "indices": [
                                0,
                                10
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874861973991400,
                "id_str": "505874861973991424",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/renai_sennin\" rel=\"nofollow\">恋愛仙人</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2698885082,
                    "id_str": "2698885082",
                    "name": "恋愛仙人",
                    "screen_name": "renai_sennin",
                    "location": "",
                    "description": "豊富でステキな恋愛経験を、シェアしましょう。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 618,
                    "friends_count": 1847,
                    "listed_count": 1,
                    "created_at": "Fri Aug 01 18:09:38 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 726,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495272204641132544/GNA18aOg_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495272204641132544/GNA18aOg_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2698885082/1406917096",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874861881700350,
                "id_str": "505874861881700353",
                "text": "@itsukibot_ 一稀の俺のソーセージをペロペロする音はデカイ",
                "source": "<a href=\"http://jigtwi.jp/?p=1\" rel=\"nofollow\">jigtwi</a>",
                "truncated": false,
                "in_reply_to_status_id": 505871017428795400,
                "in_reply_to_status_id_str": "505871017428795392",
                "in_reply_to_user_id": 141170845,
                "in_reply_to_user_id_str": "141170845",
                "in_reply_to_screen_name": "itsukibot_",
                "user": {
                    "id": 2184752048,
                    "id_str": "2184752048",
                    "name": "アンドー",
                    "screen_name": "55dakedayo",
                    "location": "",
                    "description": "",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 15,
                    "friends_count": 24,
                    "listed_count": 0,
                    "created_at": "Sat Nov 09 17:42:22 +0000 2013",
                    "favourites_count": 37249,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 21070,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://abs.twimg.com/sticky/default_profile_images/default_profile_3_normal.png",
                    "profile_image_url_https": "https://abs.twimg.com/sticky/default_profile_images/default_profile_3_normal.png",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": true,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "itsukibot_",
                            "name": "前田一稀",
                            "id": 141170845,
                            "id_str": "141170845",
                            "indices": [
                                0,
                                11
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874861185437700,
                "id_str": "505874861185437697",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/densetunodorama\" rel=\"nofollow\">あの伝説の名ドラマ＆名場面</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2706951979,
                    "id_str": "2706951979",
                    "name": "あの伝説の名ドラマ＆名場面",
                    "screen_name": "densetunodorama",
                    "location": "",
                    "description": "誰にでも記憶に残る、ドラマの名場面があると思います。そんな感動のストーリーを、もう一度わかちあいたいです。\r\n「これ知ってる！」とか「あ～懐かしい」と思ったら RT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 300,
                    "friends_count": 1886,
                    "listed_count": 0,
                    "created_at": "Mon Aug 04 16:38:25 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 694,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/496335892152209408/fKzb8Nv3_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/496335892152209408/fKzb8Nv3_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2706951979/1407170704",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:29:00 +0000 2014",
                "id": 505874860447260700,
                "id_str": "505874860447260672",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/tabetaicake1\" rel=\"nofollow\">マジで食べたい♥ケーキ特集</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2724328646,
                    "id_str": "2724328646",
                    "name": "マジで食べたい♥ケーキ特集",
                    "screen_name": "tabetaicake1",
                    "location": "",
                    "description": "女性の目線から見た、美味しそうなケーキを探し求めています。\r\n見てるだけで、あれもコレも食べたくなっちゃう♪\r\n美味しそうだと思ったら、是非 RT ＆ フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 158,
                    "friends_count": 1907,
                    "listed_count": 0,
                    "created_at": "Mon Aug 11 17:15:22 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 493,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498881289844293632/DAa9No9M_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498881289844293632/DAa9No9M_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2724328646/1407777704",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874859662925800,
                "id_str": "505874859662925824",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/adi_mania11\" rel=\"nofollow\">アディダス★マニア</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2704003662,
                    "id_str": "2704003662",
                    "name": "アディダス★マニア",
                    "screen_name": "adi_mania11",
                    "location": "",
                    "description": "素敵なアディダスのアイテムを見つけたいです♪\r\n気に入ってもらえたららRT & 相互フォローで みなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 340,
                    "friends_count": 1851,
                    "listed_count": 0,
                    "created_at": "Sun Aug 03 12:26:37 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 734,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495911561781727235/06QAMVrR_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495911561781727235/06QAMVrR_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2704003662/1407069046",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874858920513540,
                "id_str": "505874858920513537",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/moe_pet1\" rel=\"nofollow\">萌えペット大好き</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2719061228,
                    "id_str": "2719061228",
                    "name": "萌えペット大好き",
                    "screen_name": "moe_pet1",
                    "location": "",
                    "description": "かわいいペットを見るのが趣味です♥そんな私と一緒にいやされたい人いませんか？かわいいと思ったら RT & フォローもお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 289,
                    "friends_count": 1812,
                    "listed_count": 0,
                    "created_at": "Sat Aug 09 10:20:25 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 632,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498051549537386496/QizThq7N_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498051549537386496/QizThq7N_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2719061228/1407581287",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874858115219460,
                "id_str": "505874858115219456",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/renaikyoukasyo\" rel=\"nofollow\">恋愛の教科書　</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2744344514,
                    "id_str": "2744344514",
                    "name": "恋愛の教科書",
                    "screen_name": "renaikyoukasyo",
                    "location": "",
                    "description": "もっと早く知っとくべきだった～！知っていればもっと上手くいく♪ \r\n今すぐ役立つ恋愛についての雑学やマメ知識をお届けします。 \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 124,
                    "friends_count": 955,
                    "listed_count": 0,
                    "created_at": "Tue Aug 19 08:32:45 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 346,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/501655512018997248/7SznYGWi_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/501655512018997248/7SznYGWi_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2744344514/1408439001",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874857335074800,
                "id_str": "505874857335074816",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/omorogakusei\" rel=\"nofollow\">オモロすぎる★学生の日常</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2699365116,
                    "id_str": "2699365116",
                    "name": "オモロすぎる★学生の日常",
                    "screen_name": "omorogakusei",
                    "location": "",
                    "description": "楽しすぎる学生の日常を探していきます。\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 289,
                    "friends_count": 1156,
                    "listed_count": 2,
                    "created_at": "Fri Aug 01 23:35:18 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 770,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2699365116/1406936481",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874856605257700,
                "id_str": "505874856605257728",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/akogareinteria\" rel=\"nofollow\">憧れの★インテリア図鑑</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2721907602,
                    "id_str": "2721907602",
                    "name": "憧れの★インテリア図鑑",
                    "screen_name": "akogareinteria",
                    "location": "",
                    "description": "自分の住む部屋もこんなふうにしてみたい♪　\r\nそんな素敵なインテリアを、日々探していますw　\r\nいいなと思ったら RT & 相互フォローお願いします。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 298,
                    "friends_count": 1925,
                    "listed_count": 0,
                    "created_at": "Sun Aug 10 15:59:13 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 540,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498499374423343105/Wi_izHvT_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498499374423343105/Wi_izHvT_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2721907602/1407686543",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:59 +0000 2014",
                "id": 505874856089378800,
                "id_str": "505874856089378816",
                "text": "天冥の標 VI 宿怨 PART1 / 小川 一水\nhttp://t.co/fXIgRt4ffH\n \n#キンドル #天冥の標VI宿怨PART1",
                "source": "<a href=\"http://twitter.com/\" rel=\"nofollow\">waromett</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1953404612,
                    "id_str": "1953404612",
                    "name": "わろめっと",
                    "screen_name": "waromett",
                    "location": "",
                    "description": "たのしいついーとしょうかい",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 16980,
                    "friends_count": 16983,
                    "listed_count": 18,
                    "created_at": "Fri Oct 11 05:49:57 +0000 2013",
                    "favourites_count": 3833,
                    "utc_offset": 32400,
                    "time_zone": "Tokyo",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 98655,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "352726",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme5/bg.gif",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme5/bg.gif",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/378800000578908101/14c4744c7aa34b1f8bbd942b78e59385_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000578908101/14c4744c7aa34b1f8bbd942b78e59385_normal.jpeg",
                    "profile_link_color": "D02B55",
                    "profile_sidebar_border_color": "829D5E",
                    "profile_sidebar_fill_color": "99CC33",
                    "profile_text_color": "3E4415",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "キンドル",
                            "indices": [
                                50,
                                55
                            ]
                        },
                        {
                            "text": "天冥の標VI宿怨PART1",
                            "indices": [
                                56,
                                70
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/fXIgRt4ffH",
                            "expanded_url": "http://j.mp/1kHBOym",
                            "display_url": "j.mp/1kHBOym",
                            "indices": [
                                25,
                                47
                            ]
                        }
                    ],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "zh"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874855770599400,
                "id_str": "505874855770599425",
                "text": "四川盆地江淮等地将有强降雨 开学日多地将有雨: 　　中新网8月31日电 据中央气象台消息，江淮东部、四川盆地东北部等地今天(31日)又将迎来一场暴雨或大暴雨天气。明天9月1日，是中小学生开学的日子。预计明天，内蒙古中部、... http://t.co/RNdqIHmTby",
                "source": "<a href=\"http://twitterfeed.com\" rel=\"nofollow\">twitterfeed</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 402427654,
                    "id_str": "402427654",
                    "name": "中国新闻",
                    "screen_name": "zhongwenxinwen",
                    "location": "",
                    "description": "中国的新闻，世界的新闻。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 2429,
                    "friends_count": 15,
                    "listed_count": 29,
                    "created_at": "Tue Nov 01 01:56:43 +0000 2011",
                    "favourites_count": 0,
                    "utc_offset": -28800,
                    "time_zone": "Alaska",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 84564,
                    "lang": "zh-cn",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "709397",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme6/bg.gif",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme6/bg.gif",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/2700523149/5597e347b2eb880425faef54287995f2_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/2700523149/5597e347b2eb880425faef54287995f2_normal.jpeg",
                    "profile_link_color": "FF3300",
                    "profile_sidebar_border_color": "86A4A6",
                    "profile_sidebar_fill_color": "A0C5C7",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/RNdqIHmTby",
                            "expanded_url": "http://bit.ly/1tOdNsI",
                            "display_url": "bit.ly/1tOdNsI",
                            "indices": [
                                114,
                                136
                            ]
                        }
                    ],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "zh"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874854877200400,
                "id_str": "505874854877200384",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/LDH_daisuki1\" rel=\"nofollow\">LDH ★大好き応援団</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2700961603,
                    "id_str": "2700961603",
                    "name": "LDH ★大好き応援団",
                    "screen_name": "LDH_daisuki1",
                    "location": "",
                    "description": "LDHファンは、全員仲間です♪\r\n面白かったらRT & 相互フォローでみなさん、お願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 458,
                    "friends_count": 1895,
                    "listed_count": 0,
                    "created_at": "Sat Aug 02 14:23:46 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 735,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/495578007298252800/FOZflgYu_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/495578007298252800/FOZflgYu_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2700961603/1406989928",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874854147407900,
                "id_str": "505874854147407872",
                "text": "RT @shiawaseomamori: 一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるの…",
                "source": "<a href=\"https://twitter.com/anime_toshiden1\" rel=\"nofollow\">マジ!?怖いアニメ都市伝説</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2719489172,
                    "id_str": "2719489172",
                    "name": "マジ!?怖いアニメ都市伝説",
                    "screen_name": "anime_toshiden1",
                    "location": "",
                    "description": "あなたの知らない、怖すぎるアニメの都市伝説を集めています。\r\n「え～知らなかったよww]」って人は RT & フォローお願いします♪",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 377,
                    "friends_count": 1911,
                    "listed_count": 1,
                    "created_at": "Sat Aug 09 14:41:15 +0000 2014",
                    "favourites_count": 0,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 536,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/498118027322208258/h7XOTTSi_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/498118027322208258/h7XOTTSi_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2719489172/1407595513",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:06 +0000 2014",
                    "id": 505871615125491700,
                    "id_str": "505871615125491712",
                    "text": "一に止まると書いて、正しいという意味だなんて、この年になるまで知りませんでした。 人は生きていると、前へ前へという気持ちばかり急いて、どんどん大切なものを置き去りにしていくものでしょう。本当に正しいことというのは、一番初めの場所にあるのかもしれません。 by神様のカルテ、夏川草介",
                    "source": "<a href=\"https://twitter.com/shiawaseomamori\" rel=\"nofollow\">幸せの☆お守り</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2745121514,
                        "id_str": "2745121514",
                        "name": "幸せの☆お守り",
                        "screen_name": "shiawaseomamori",
                        "location": "",
                        "description": "自分が幸せだと周りも幸せにできる！ \r\nそんな人生を精一杯生きるために必要な言葉をお届けします♪ \r\nいいなと思ったら RT & 相互フォローで、お願いします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 213,
                        "friends_count": 991,
                        "listed_count": 0,
                        "created_at": "Tue Aug 19 14:45:19 +0000 2014",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 349,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/501742437606244354/scXy81ZW_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2745121514/1408459730",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 58,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 58,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "shiawaseomamori",
                            "name": "幸せの☆お守り",
                            "id": 2745121514,
                            "id_str": "2745121514",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874854134820860,
                "id_str": "505874854134820864",
                "text": "@vesperia1985 おはよー！\n今日までなのですよ…！！明日一生来なくていい",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": 505868030329364500,
                "in_reply_to_status_id_str": "505868030329364480",
                "in_reply_to_user_id": 2286548834,
                "in_reply_to_user_id_str": "2286548834",
                "in_reply_to_screen_name": "vesperia1985",
                "user": {
                    "id": 2389045190,
                    "id_str": "2389045190",
                    "name": "りいこ",
                    "screen_name": "riiko_dq10",
                    "location": "",
                    "description": "サマーエルフです、りいこです。えるおくんラブです！随時ふれぼしゅ〜〜(っ˘ω˘c )＊日常のどうでもいいことも呟いてますがよろしくね〜",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 67,
                    "friends_count": 69,
                    "listed_count": 0,
                    "created_at": "Fri Mar 14 13:02:27 +0000 2014",
                    "favourites_count": 120,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 324,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/503906346815610881/BfSrCoBr_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/503906346815610881/BfSrCoBr_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/2389045190/1409232058",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "vesperia1985",
                            "name": "ユーリ",
                            "id": 2286548834,
                            "id_str": "2286548834",
                            "indices": [
                                0,
                                13
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874853778685950,
                "id_str": "505874853778685952",
                "text": "【映画パンフレット】　永遠の０ （永遠のゼロ）　監督　山崎貴　キャスト　岡田准一、三浦春馬、井上真央東宝(2)11点の新品／中古品を見る: ￥ 500より\n(この商品の現在のランクに関する正式な情報については、アートフレーム... http://t.co/4hbyB1rbQ7",
                "source": "<a href=\"http://ifttt.com\" rel=\"nofollow\">IFTTT</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1319883571,
                    "id_str": "1319883571",
                    "name": "森林木工家具製作所",
                    "screen_name": "Furniturewood",
                    "location": "沖縄",
                    "description": "家具（かぐ、Furniture）は、家財道具のうち家の中に据え置いて利用する比較的大型の道具類、または元々家に作り付けられている比較的大型の道具類をさす。なお、日本の建築基準法上は、作り付け家具は、建築確認及び完了検査の対象となるが、後から置かれるものについては対象外である。",
                    "url": "http://t.co/V4oyL0xtZk",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/V4oyL0xtZk",
                                    "expanded_url": "http://astore.amazon.co.jp/furniturewood-22",
                                    "display_url": "astore.amazon.co.jp/furniturewood-…",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 677,
                    "friends_count": 743,
                    "listed_count": 1,
                    "created_at": "Mon Apr 01 07:55:14 +0000 2013",
                    "favourites_count": 0,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 17210,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/3460466135/c67d9df9b760787b9ed284fe80b1dd31_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/3460466135/c67d9df9b760787b9ed284fe80b1dd31_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1319883571/1364804982",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/4hbyB1rbQ7",
                            "expanded_url": "http://ift.tt/1kT55bk",
                            "display_url": "ift.tt/1kT55bk",
                            "indices": [
                                116,
                                138
                            ]
                        }
                    ],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874852754907140,
                "id_str": "505874852754907136",
                "text": "RT @siranuga_hotoke: ゴキブリは一世帯に平均して480匹いる。",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 413944345,
                    "id_str": "413944345",
                    "name": "泥酔イナバウアー",
                    "screen_name": "Natade_co_co_21",
                    "location": "",
                    "description": "君の瞳にうつる僕に乾杯。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 298,
                    "friends_count": 300,
                    "listed_count": 4,
                    "created_at": "Wed Nov 16 12:52:46 +0000 2011",
                    "favourites_count": 3125,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 12237,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "FFF04D",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/378800000115928444/9bf5fa13385cc80bfeb097e51af9862a.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/378800000115928444/9bf5fa13385cc80bfeb097e51af9862a.jpeg",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/500849752351600640/lMQqIzYj_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/500849752351600640/lMQqIzYj_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/413944345/1403511193",
                    "profile_link_color": "0099CC",
                    "profile_sidebar_border_color": "000000",
                    "profile_sidebar_fill_color": "F6FFD1",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sat Aug 30 23:24:23 +0000 2014",
                    "id": 505858599411666940,
                    "id_str": "505858599411666944",
                    "text": "ゴキブリは一世帯に平均して480匹いる。",
                    "source": "<a href=\"http://twittbot.net/\" rel=\"nofollow\">twittbot.net</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 2243896200,
                        "id_str": "2243896200",
                        "name": "知らぬが仏bot",
                        "screen_name": "siranuga_hotoke",
                        "location": "奈良・京都辺り",
                        "description": "知らぬが仏な情報をお伝えします。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 3288,
                        "friends_count": 3482,
                        "listed_count": 7,
                        "created_at": "Fri Dec 13 13:16:35 +0000 2013",
                        "favourites_count": 0,
                        "utc_offset": null,
                        "time_zone": null,
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 1570,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/378800000866399372/ypy5NnPe_normal.png",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000866399372/ypy5NnPe_normal.png",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/2243896200/1386997755",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 1,
                    "favorite_count": 0,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "lang": "ja"
                },
                "retweet_count": 1,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [],
                    "user_mentions": [
                        {
                            "screen_name": "siranuga_hotoke",
                            "name": "知らぬが仏bot",
                            "id": 2243896200,
                            "id_str": "2243896200",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:58 +0000 2014",
                "id": 505874852603908100,
                "id_str": "505874852603908096",
                "text": "RT @UARROW_Y: ようかい体操第一を踊る国見英 http://t.co/SXoYWH98as",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 2463035136,
                    "id_str": "2463035136",
                    "name": "や",
                    "screen_name": "yae45",
                    "location": "",
                    "description": "きもちわるいことつぶやく用",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 4,
                    "friends_count": 30,
                    "listed_count": 0,
                    "created_at": "Fri Apr 25 10:49:20 +0000 2014",
                    "favourites_count": 827,
                    "utc_offset": 32400,
                    "time_zone": "Irkutsk",
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 390,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/505345820137234433/csFeRxPm_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/505345820137234433/csFeRxPm_normal.jpeg",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "ja"
                    },
                    "created_at": "Sun Aug 31 00:16:45 +0000 2014",
                    "id": 505871779949051900,
                    "id_str": "505871779949051904",
                    "text": "ようかい体操第一を踊る国見英 http://t.co/SXoYWH98as",
                    "source": "<a href=\"http://twitter.com/download/android\" rel=\"nofollow\">Twitter for Android</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 1261662588,
                        "id_str": "1261662588",
                        "name": "ゆう矢",
                        "screen_name": "UARROW_Y",
                        "location": "つくり出そう国影の波 広げよう国影の輪",
                        "description": "HQ!! 成人済腐女子。日常ツイート多いです。赤葦京治夢豚クソツイ含みます注意。フォローをお考えの際はプロフご一読お願い致します。FRBお気軽に",
                        "url": "http://t.co/LFX2XOzb0l",
                        "entities": {
                            "url": {
                                "urls": [
                                    {
                                        "url": "http://t.co/LFX2XOzb0l",
                                        "expanded_url": "http://twpf.jp/UARROW_Y",
                                        "display_url": "twpf.jp/UARROW_Y",
                                        "indices": [
                                            0,
                                            22
                                        ]
                                    }
                                ]
                            },
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 265,
                        "friends_count": 124,
                        "listed_count": 12,
                        "created_at": "Tue Mar 12 10:42:17 +0000 2013",
                        "favourites_count": 6762,
                        "utc_offset": 32400,
                        "time_zone": "Tokyo",
                        "geo_enabled": true,
                        "verified": false,
                        "statuses_count": 55946,
                        "lang": "ja",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "C0DEED",
                        "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                        "profile_background_tile": false,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/502095104618663937/IzuPYx3E_normal.png",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/502095104618663937/IzuPYx3E_normal.png",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/1261662588/1408618604",
                        "profile_link_color": "0084B4",
                        "profile_sidebar_border_color": "C0DEED",
                        "profile_sidebar_fill_color": "DDEEF6",
                        "profile_text_color": "333333",
                        "profile_use_background_image": true,
                        "default_profile": true,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 29,
                    "favorite_count": 54,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [
                            {
                                "url": "http://t.co/SXoYWH98as",
                                "expanded_url": "http://twitter.com/UARROW_Y/status/505871779949051904/photo/1",
                                "display_url": "pic.twitter.com/SXoYWH98as",
                                "indices": [
                                    15,
                                    37
                                ]
                            }
                        ],
                        "user_mentions": []
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "ja"
                },
                "retweet_count": 29,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/SXoYWH98as",
                            "expanded_url": "http://twitter.com/UARROW_Y/status/505871779949051904/photo/1",
                            "display_url": "pic.twitter.com/SXoYWH98as",
                            "indices": [
                                29,
                                51
                            ]
                        }
                    ],
                    "user_mentions": [
                        {
                            "screen_name": "UARROW_Y",
                            "name": "ゆう矢",
                            "id": 1261662588,
                            "id_str": "1261662588",
                            "indices": [
                                3,
                                12
                            ]
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "zh"
                },
                "created_at": "Sun Aug 31 00:28:57 +0000 2014",
                "id": 505874848900341760,
                "id_str": "505874848900341760",
                "text": "RT @fightcensorship: 李克強總理的臉綠了！在前日南京青奧會閉幕式，觀眾席上一名貪玩韓國少年運動員，竟斗膽用激光筆射向中國總理李克強的臉。http://t.co/HLX9mHcQwe http://t.co/fVVOSML5s8",
                "source": "<a href=\"http://twitter.com/download/iphone\" rel=\"nofollow\">Twitter for iPhone</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 889332218,
                    "id_str": "889332218",
                    "name": "民權初步",
                    "screen_name": "JoeyYoungkm",
                    "location": "km/cn",
                    "description": "经历了怎样的曲折才从追求“一致通过”发展到今天人们接受“过半数通过”，正是人们认识到对“一致”甚至是“基本一致”的追求本身就会变成一种独裁。",
                    "url": null,
                    "entities": {
                        "description": {
                            "urls": []
                        }
                    },
                    "protected": false,
                    "followers_count": 313,
                    "friends_count": 46,
                    "listed_count": 0,
                    "created_at": "Thu Oct 18 17:21:17 +0000 2012",
                    "favourites_count": 24,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 15707,
                    "lang": "en",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "C0DEED",
                    "profile_background_image_url": "http://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_image_url_https": "https://abs.twimg.com/images/themes/theme1/bg.png",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/378800000563062033/a7e8274752ce36a6cd5bad971ec7d416_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/378800000563062033/a7e8274752ce36a6cd5bad971ec7d416_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/889332218/1388896916",
                    "profile_link_color": "0084B4",
                    "profile_sidebar_border_color": "C0DEED",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": true,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweeted_status": {
                    "metadata": {
                        "result_type": "recent",
                        "iso_language_code": "zh"
                    },
                    "created_at": "Sat Aug 30 23:56:27 +0000 2014",
                    "id": 505866670356070400,
                    "id_str": "505866670356070401",
                    "text": "李克強總理的臉綠了！在前日南京青奧會閉幕式，觀眾席上一名貪玩韓國少年運動員，竟斗膽用激光筆射向中國總理李克強的臉。http://t.co/HLX9mHcQwe http://t.co/fVVOSML5s8",
                    "source": "<a href=\"http://twitter.com\" rel=\"nofollow\">Twitter Web Client</a>",
                    "truncated": false,
                    "in_reply_to_status_id": null,
                    "in_reply_to_status_id_str": null,
                    "in_reply_to_user_id": null,
                    "in_reply_to_user_id_str": null,
                    "in_reply_to_screen_name": null,
                    "user": {
                        "id": 67661086,
                        "id_str": "67661086",
                        "name": "※范强※法特姗瑟希蒲※",
                        "screen_name": "fightcensorship",
                        "location": "Middle of Nowhere",
                        "description": "被人指责“封建”、“落后”、“保守”的代表，当代红卫兵攻击对象。致力于言论自由，人权； 倡导资讯公开，反对网络封锁。既不是精英分子，也不是意见领袖，本推言论不代表任何国家、党派和组织，也不标榜伟大、光荣和正确。",
                        "url": null,
                        "entities": {
                            "description": {
                                "urls": []
                            }
                        },
                        "protected": false,
                        "followers_count": 7143,
                        "friends_count": 779,
                        "listed_count": 94,
                        "created_at": "Fri Aug 21 17:16:22 +0000 2009",
                        "favourites_count": 364,
                        "utc_offset": 28800,
                        "time_zone": "Singapore",
                        "geo_enabled": false,
                        "verified": false,
                        "statuses_count": 16751,
                        "lang": "en",
                        "contributors_enabled": false,
                        "is_translator": false,
                        "is_translation_enabled": false,
                        "profile_background_color": "FFFFFF",
                        "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/611138516/toeccqnahbpmr0sw9ybv.jpeg",
                        "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/611138516/toeccqnahbpmr0sw9ybv.jpeg",
                        "profile_background_tile": true,
                        "profile_image_url": "http://pbs.twimg.com/profile_images/3253137427/3524557d21ef2c04871e985d4d136bdb_normal.jpeg",
                        "profile_image_url_https": "https://pbs.twimg.com/profile_images/3253137427/3524557d21ef2c04871e985d4d136bdb_normal.jpeg",
                        "profile_banner_url": "https://pbs.twimg.com/profile_banners/67661086/1385608347",
                        "profile_link_color": "ED1313",
                        "profile_sidebar_border_color": "FFFFFF",
                        "profile_sidebar_fill_color": "E0FF92",
                        "profile_text_color": "000000",
                        "profile_use_background_image": true,
                        "default_profile": false,
                        "default_profile_image": false,
                        "following": false,
                        "follow_request_sent": false,
                        "notifications": false
                    },
                    "geo": null,
                    "coordinates": null,
                    "place": null,
                    "contributors": null,
                    "retweet_count": 4,
                    "favorite_count": 2,
                    "entities": {
                        "hashtags": [],
                        "symbols": [],
                        "urls": [
                            {
                                "url": "http://t.co/HLX9mHcQwe",
                                "expanded_url": "http://is.gd/H3OgTO",
                                "display_url": "is.gd/H3OgTO",
                                "indices": [
                                    57,
                                    79
                                ]
                            }
                        ],
                        "user_mentions": [],
                        "media": [
                            {
                                "id": 505866668485386240,
                                "id_str": "505866668485386241",
                                "indices": [
                                    80,
                                    102
                                ],
                                "media_url": "http://pbs.twimg.com/media/BwUzDgbIIAEgvhD.jpg",
                                "media_url_https": "https://pbs.twimg.com/media/BwUzDgbIIAEgvhD.jpg",
                                "url": "http://t.co/fVVOSML5s8",
                                "display_url": "pic.twitter.com/fVVOSML5s8",
                                "expanded_url": "http://twitter.com/fightcensorship/status/505866670356070401/photo/1",
                                "type": "photo",
                                "sizes": {
                                    "large": {
                                        "w": 640,
                                        "h": 554,
                                        "resize": "fit"
                                    },
                                    "medium": {
                                        "w": 600,
                                        "h": 519,
                                        "resize": "fit"
                                    },
                                    "thumb": {
                                        "w": 150,
                                        "h": 150,
                                        "resize": "crop"
                                    },
                                    "small": {
                                        "w": 340,
                                        "h": 294,
                                        "resize": "fit"
                                    }
                                }
                            }
                        ]
                    },
                    "favorited": false,
                    "retweeted": false,
                    "possibly_sensitive": false,
                    "lang": "zh"
                },
                "retweet_count": 4,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/HLX9mHcQwe",
                            "expanded_url": "http://is.gd/H3OgTO",
                            "display_url": "is.gd/H3OgTO",
                            "indices": [
                                78,
                                100
                            ]
                        }
                    ],
                    "user_mentions": [
                        {
                            "screen_name": "fightcensorship",
                            "name": "※范强※法特姗瑟希蒲※",
                            "id": 67661086,
                            "id_str": "67661086",
                            "indices": [
                                3,
                                19
                            ]
                        }
                    ],
                    "media": [
                        {
                            "id": 505866668485386240,
                            "id_str": "505866668485386241",
                            "indices": [
                                101,
                                123
                            ],
                            "media_url": "http://pbs.twimg.com/media/BwUzDgbIIAEgvhD.jpg",
                            "media_url_https": "https://pbs.twimg.com/media/BwUzDgbIIAEgvhD.jpg",
                            "url": "http://t.co/fVVOSML5s8",
                            "display_url": "pic.twitter.com/fVVOSML5s8",
                            "expanded_url": "http://twitter.com/fightcensorship/status/505866670356070401/photo/1",
                            "type": "photo",
                            "sizes": {
                                "large": {
                                    "w": 640,
                                    "h": 554,
                                    "resize": "fit"
                                },
                                "medium": {
                                    "w": 600,
                                    "h": 519,
                                    "resize": "fit"
                                },
                                "thumb": {
                                    "w": 150,
                                    "h": 150,
                                    "resize": "crop"
                                },
                                "small": {
                                    "w": 340,
                                    "h": 294,
                                    "resize": "fit"
                                }
                            },
                            "source_status_id": 505866670356070400,
                            "source_status_id_str": "505866670356070401"
                        }
                    ]
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "zh"
            },
            {
                "metadata": {
                    "result_type": "recent",
                    "iso_language_code": "ja"
                },
                "created_at": "Sun Aug 31 00:28:56 +0000 2014",
                "id": 505874847260352500,
                "id_str": "505874847260352513",
                "text": "【マイリスト】【彩りりあ】妖怪体操第一　踊ってみた【反転】 http://t.co/PjL9if8OZC #sm24357625",
                "source": "<a href=\"http://www.nicovideo.jp/\" rel=\"nofollow\">ニコニコ動画</a>",
                "truncated": false,
                "in_reply_to_status_id": null,
                "in_reply_to_status_id_str": null,
                "in_reply_to_user_id": null,
                "in_reply_to_user_id_str": null,
                "in_reply_to_screen_name": null,
                "user": {
                    "id": 1609789375,
                    "id_str": "1609789375",
                    "name": "食いしん坊前ちゃん",
                    "screen_name": "2no38mae",
                    "location": "ニノと二次元の間",
                    "description": "ニコ動で踊り手やってます!!応援本当に嬉しいですありがとうございます!!　ぽっちゃりだけど前向きに頑張る腐女子です。嵐と弱虫ペダルが大好き！【お返事】りぷ(基本は)”○”　DM (同業者様を除いて)”×”　動画の転載は絶対にやめてください。 ブログ→http://t.co/8E91tqoeKX　　",
                    "url": "http://t.co/ulD2e9mcwb",
                    "entities": {
                        "url": {
                            "urls": [
                                {
                                    "url": "http://t.co/ulD2e9mcwb",
                                    "expanded_url": "http://www.nicovideo.jp/mylist/37917495",
                                    "display_url": "nicovideo.jp/mylist/37917495",
                                    "indices": [
                                        0,
                                        22
                                    ]
                                }
                            ]
                        },
                        "description": {
                            "urls": [
                                {
                                    "url": "http://t.co/8E91tqoeKX",
                                    "expanded_url": "http://ameblo.jp/2no38mae/",
                                    "display_url": "ameblo.jp/2no38mae/",
                                    "indices": [
                                        125,
                                        147
                                    ]
                                }
                            ]
                        }
                    },
                    "protected": false,
                    "followers_count": 560,
                    "friends_count": 875,
                    "listed_count": 11,
                    "created_at": "Sun Jul 21 05:09:43 +0000 2013",
                    "favourites_count": 323,
                    "utc_offset": null,
                    "time_zone": null,
                    "geo_enabled": false,
                    "verified": false,
                    "statuses_count": 3759,
                    "lang": "ja",
                    "contributors_enabled": false,
                    "is_translator": false,
                    "is_translation_enabled": false,
                    "profile_background_color": "F2C6E4",
                    "profile_background_image_url": "http://pbs.twimg.com/profile_background_images/378800000029400927/114b242f5d838ec7cb098ea5db6df413.jpeg",
                    "profile_background_image_url_https": "https://pbs.twimg.com/profile_background_images/378800000029400927/114b242f5d838ec7cb098ea5db6df413.jpeg",
                    "profile_background_tile": false,
                    "profile_image_url": "http://pbs.twimg.com/profile_images/487853237723095041/LMBMGvOc_normal.jpeg",
                    "profile_image_url_https": "https://pbs.twimg.com/profile_images/487853237723095041/LMBMGvOc_normal.jpeg",
                    "profile_banner_url": "https://pbs.twimg.com/profile_banners/1609789375/1375752225",
                    "profile_link_color": "FF9EDD",
                    "profile_sidebar_border_color": "FFFFFF",
                    "profile_sidebar_fill_color": "DDEEF6",
                    "profile_text_color": "333333",
                    "profile_use_background_image": true,
                    "default_profile": false,
                    "default_profile_image": false,
                    "following": false,
                    "follow_request_sent": false,
                    "notifications": false
                },
                "geo": null,
                "coordinates": null,
                "place": null,
                "contributors": null,
                "retweet_count": 0,
                "favorite_count": 0,
                "entities": {
                    "hashtags": [
                        {
                            "text": "sm24357625",
                            "indices": [
                                53,
                                64
                            ]
                        }
                    ],
                    "symbols": [],
                    "urls": [
                        {
                            "url": "http://t.co/PjL9if8OZC",
                            "expanded_url": "http://nico.ms/sm24357625",
                            "display_url": "nico.ms/sm24357625",
                            "indices": [
                                30,
                                52
                            ]
                        }
                    ],
                    "user_mentions": []
                },
                "favorited": false,
                "retweeted": false,
                "possibly_sensitive": false,
                "lang": "ja"
            }
        ],
        "search_metadata": {
            "completed_in": 0.087,
            "max_id": 505874924095815700,
            "max_id_str": "505874924095815681",
            "next_results": "?max_id=505874847260352512&q=%E4%B8%80&count=100&include_entities=1",
            "query": "%E4%B8%80",
            "refresh_url": "?since_id=505874924095815681&q=%E4%B8%80&include_entities=1",
            "count": 100,
            "since_id": 0,
            "since_id_str": "0"
        }
    };
    /* eslint-enable */
}
