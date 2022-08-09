import {
    getRandomBoolean, getRandomEnglishString, getRandomNumber,
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
            source_status_id: number;
            source_status_id_str: string;
        }[];
    };
    favorited: boolean;
    retweeted: boolean;
    lang: string;
    retweeted_status: Omit<TwitterStatus, "in_reply_to_user_id" | "in_reply_to_user_id_str"
        | "in_reply_to_screen_name" | "in_reply_to_status_id" | "in_reply_to_status_id_str" | "search_metadata">;
    possibly_sensitive: boolean;
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
    profile_banner_url: string;
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
* @param sizeInKb - size to generate json object
* @param includeUnicode - true to include unicode in any strings within the json
* @param allowOversize - Allows the json to go over the sizeInKb limit. If enabled, the
* generated json may be closer to the desired byte size but there is a risk of exceeding the inputted byte limit
* @returns TwitterJson
*/
export function generateTwitterJsonByByteSize(sizeInBytes: number, includeUnicode: boolean, allowOversize: boolean) {
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
        const twitterStatus = generateTwitterStatus("standard", includeUnicode);
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
export function generateTwitterJsonByNumStatuses(numStatuses: number, includeUnicode: boolean) {
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
        twitterJson.statuses.push(generateTwitterStatus("standard", includeUnicode));
    }

    return twitterJson;
}

/* eslint-disable no-useless-escape */
function generateTwitterStatus(type: "standard" | "retweet", includeUnicode: boolean) {
    // id is always an 18 digit number
    const statusIdString = getRandomNumberString(18, 18);
    const retweetCount = Math.floor(getRandomNumber(0, 99999));
    const favoriteCount = Math.floor(getRandomNumber(0, 99999));
    const twitterUser = generateTwitterUser(includeUnicode);
    const shouldAddHashtagEntity = getRandomBoolean();
    const shouldAddUrlEntity = getRandomBoolean();
    const shouldAddUserMentionsEntity = getRandomBoolean();
    const shouldAddMediaEntity = getRandomBoolean();

    const twitterStatus: any = {
        metadata: {
            result_type: "recent",
            iso_language_code: "ja",
        },
        // adding created_at variation to won't serve any purpose.
        created_at: getRandomDateString(new Date("2005-01-01"), new Date("2022-01-01")),
        id: Number(statusIdString),
        id_str: statusIdString,
        text: includeUnicode ? getRandomKanjiString(1, 200) : getRandomEnglishString(false, 1, 200),
        // source can have unicode nested in it
        source: `<a href=\"https://twitter.com/${twitterUser.screen_name}\" rel=\"nofollow\">
               ${includeUnicode ? getRandomKanjiString(1, 30) : getRandomEnglishString(false, 1, 30)}</a>`,
        truncated: true, // no examples found where truncated was false
        user: twitterUser,
        // could not find an example of non null value for these 4 values (geo, coordinaes, place, contributors)
        geo: null,
        coordinates: null,
        place: null,
        contributors: null,
        possibly_sensitive: getRandomBoolean(),
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
        // 50% probabality
        const inReplyToStatusId = Math.random() === 1 ? getRandomNumberString(18, 18) : null;
        const inReplyToUserId = Math.random() === 1 ? getRandomNumberString(10, 10) : null;
        twitterStatus.in_reply_to_status_id = inReplyToStatusId !== null ? Number(inReplyToStatusId) : null;
        twitterStatus.in_reply_to_status_id_str = inReplyToStatusId !== null ? inReplyToStatusId : null;
        twitterStatus.in_reply_to_user_id = inReplyToUserId !== null ? Number(inReplyToUserId) : null;
        twitterStatus.in_reply_to_user_id_str = inReplyToUserId !== null ? inReplyToUserId : null;
        twitterStatus.in_reply_to_screen_name = inReplyToUserId !== null ? getRandomEnglishString(false, 6, 30) : null;
        twitterStatus.retweeted_status = generateTwitterStatus("retweet", includeUnicode);
    }

    if (shouldAddHashtagEntity) {
        twitterStatus.entities.hashtags.push({
            text: getRandomKanjiString(1, 30),
            indices: [
                Math.floor(getRandomNumber(0, 199)),
                Math.floor(getRandomNumber(0, 199)),
            ],
        });
    }
    if (shouldAddUrlEntity) {
        twitterStatus.entities.urls.push({
            url: "http://t.co/ZkU4TZCGPG",
            expanded_url: "http://www.tepco.co.jp/nu/fukushima-np/review/images/review1_01.gif",
            display_url: "tepco.co.jp/nu/fukushima-n…",
            indices: [
                Math.floor(getRandomNumber(0, 199)),
                Math.floor(getRandomNumber(0, 199)),
            ],
        });
    }
    if (shouldAddUserMentionsEntity) {
        const userId = getRandomNumberString(10, 10);
        twitterStatus.entities.user_mentions.push({
            screen_name: getRandomEnglishString(true, 6, 30),
            name: getRandomKanjiString(1, 30),
            id: Number(userId),
            id_str: userId,
            indices: [
                Math.floor(getRandomNumber(0, 199)),
                Math.floor(getRandomNumber(0, 199)),
            ],
        });
    }
    if (shouldAddMediaEntity) {
        const mediaStatusIdString = getRandomNumberString(18, 18);
        const shouldAddSourceIdData = getRandomBoolean();
        const mediaEntity: any = {
            id: Number(mediaStatusIdString),
            id_str: "statusIdString",
            indices: [
                Math.floor(getRandomNumber(0, 199)),
                Math.floor(getRandomNumber(0, 199)),
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
            mediaEntity.source_status_id_str = getRandomNumberString(18, 18);
            mediaEntity.source_status_id = Number(mediaEntity.source_status_id_str);
        }
        twitterStatus.entities.media = [mediaEntity];
    }

    return twitterStatus as TwitterStatus;
}

function generateTwitterUser(includeUnicode: boolean): TwitterUser {
    const userId = getRandomNumberString(10, 10);
    const shouldAddUrlUrlsEntity = getRandomBoolean();
    const shouldAddDescriptionUrlsEntity = getRandomBoolean();
    const shouldAddUtcOffsetAndtimezone = getRandomBoolean();
    const user: TwitterUser = {
        id: Number(userId),
        id_str: userId,
        name: includeUnicode ? getRandomKanjiString(1, 30) : getRandomEnglishString(false, 1, 30),
        // screen names do not include unicode characters
        screen_name: getRandomEnglishString(false, 6, 30),
        location: "",
        description: includeUnicode ? getRandomKanjiString(1, 200) : getRandomEnglishString(false, 1, 200),
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
        created_at: getRandomDateString(new Date("2005-01-01"), new Date("2022-01-01")),
        favourites_count: 0,
        utc_offset: shouldAddUtcOffsetAndtimezone ? 32400 : null,
        time_zone: shouldAddUtcOffsetAndtimezone ? "Tokyo" : null,
        geo_enabled: getRandomBoolean(),
        verified: getRandomBoolean(),
        statuses_count: Math.floor(getRandomNumber(0, 99999)),
        lang: "ja",
        contributors_enabled: getRandomBoolean(),
        is_translator: getRandomBoolean(),
        is_translation_enabled: getRandomBoolean(),
        profile_background_color: getRandomEnglishString(true, 6, 6),
        profile_background_image_url: "http://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_image_url_https: "https://abs.twimg.com/images/themes/theme1/bg.png",
        profile_background_tile: getRandomBoolean(),
        profile_image_url: "http://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_image_url_https: "https://pbs.twimg.com/profile_images/495353473886478336/S-4B_RVl_normal.jpeg",
        profile_banner_url: "https://pbs.twimg.com/profile_banners/2699365116/1406936481",
        profile_link_color: getRandomEnglishString(true, 6, 6),
        profile_sidebar_border_color: getRandomEnglishString(true, 6, 6),
        profile_sidebar_fill_color: getRandomEnglishString(true, 6, 6),
        profile_text_color: getRandomEnglishString(true, 6, 6),
        profile_use_background_image: getRandomBoolean(),
        default_profile: getRandomBoolean(),
        default_profile_image: getRandomBoolean(),
        following: getRandomBoolean(),
        follow_request_sent: getRandomBoolean(),
        notifications: getRandomBoolean(),
    };
    if (shouldAddUrlUrlsEntity) {
        user.entities.url = {
            urls: [
                {
                    url: "http://t.co/V4oyL0xtZk",
                    expanded_url: "http://astore.amazon.co.jp/furniturewood-22",
                    display_url: "astore.amazon.co.jp/furniturewood-…",
                    indices: [
                        Math.floor(getRandomNumber(0, 199)),
                        Math.floor(getRandomNumber(0, 199)),
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
                    Math.floor(getRandomNumber(0, 199)),
                    Math.floor(getRandomNumber(0, 199)),
                ],
            },
        );
    }

    return user;
}
/* eslint-enable */

// This includes common and uncommon kanji characters
// but not rare kanji characters (3400 - 4dbf) as none were found in the source twitter json.
function getRandomKanjiString(minLen: number, maxLen: number) {
    return getRandomStringByCharCode(minLen, maxLen, 0x4e00, 0x9faf);
}

// This is specifically formatted like the twitter json dates
// (<3-letter-weekday> MMM DD HH:MM:SS <4-digit-TimezoneOffset> YYYY)
function getRandomDateString(start: Date, end: Date) {
    const dateS = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toString();
    return `${dateS.substring(0, 10)} ${dateS.substring(16, 24)} ` +
    `${dateS.substring(28, 33)} ${dateS.substring(11, 15)}`;
}
