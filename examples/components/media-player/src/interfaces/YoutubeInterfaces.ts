/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

type datetime = string;
type etag = string;
type unsignedinteger = number;
type unsignedlong = number;
type long = number;
type double = number;
type integer = number;

export interface IVideo {
    kind: "youtube#video";
    etag: etag;
    id: string;
    snippet: {
        publishedAt: datetime,
        channelId: string,
        title: string,
        description: string,
        thumbnails: {
            [key: string]: {
                url: string,
                width: unsignedinteger,
                height: unsignedinteger
            }
        },
        channelTitle: string,
        tags: string[],
        categoryId: string,
        liveBroadcastContent: string,
        defaultLanguage: string,
        localized: {
            title: string,
            description: string
        },
        defaultAudioLanguage: string
    };
    contentDetails: {
        duration: string,
        dimension: string,
        definition: string,
        caption: string,
        licensedContent: boolean,
        regionRestriction: {
            allowed: string[],
            blocked: string[]
        },
        contentRating: {
            acbRating: string,
            agcomRating: string,
            anatelRating: string,
            bbfcRating: string,
            bfvcRating: string,
            bmukkRating: string,
            catvRating: string,
            catvfrRating: string,
            cbfcRating: string,
            cccRating: string,
            cceRating: string,
            chfilmRating: string,
            chvrsRating: string,
            cicfRating: string,
            cnaRating: string,
            cncRating: string,
            csaRating: string,
            cscfRating: string,
            czfilmRating: string,
            djctqRating: string,
            djctqRatingReasons: string[],
            ecbmctRating: string,
            eefilmRating: string,
            egfilmRating: string,
            eirinRating: string,
            fcbmRating: string,
            fcoRating: string,
            fmocRating: string,
            fpbRating: string,
            fpbRatingReasons: string[],
            fskRating: string,
            grfilmRating: string,
            icaaRating: string,
            ifcoRating: string,
            ilfilmRating: string,
            incaaRating: string,
            kfcbRating: string,
            kijkwijzerRating: string,
            kmrbRating: string,
            lsfRating: string,
            mccaaRating: string,
            mccypRating: string,
            mcstRating: string,
            mdaRating: string,
            medietilsynetRating: string,
            mekuRating: string,
            mibacRating: string,
            mocRating: string,
            moctwRating: string,
            mpaaRating: string,
            mtrcbRating: string,
            nbcRating: string,
            nbcplRating: string,
            nfrcRating: string,
            nfvcbRating: string,
            nkclvRating: string,
            oflcRating: string,
            pefilmRating: string,
            rcnofRating: string,
            resorteviolenciaRating: string,
            rtcRating: string,
            rteRating: string,
            russiaRating: string,
            skfilmRating: string,
            smaisRating: string,
            smsaRating: string,
            tvpgRating: string,
            ytRating: string
        },
        projection: string,
        hasCustomThumbnail: boolean
    };
    status: {
        uploadStatus: string,
        failureReason: string,
        rejectionReason: string,
        privacyStatus: string,
        publishAt: datetime,
        license: string,
        embeddable: boolean,
        publicStatsViewable: boolean
    };
    statistics: {
        viewCount: unsignedlong,
        likeCount: unsignedlong,
        dislikeCount: unsignedlong,
        favoriteCount: unsignedlong,
        commentCount: unsignedlong
    };
    player: {
        embedHtml: string,
        embedHeight: long,
        embedWidth: long
    };
    topicDetails: {
        topicIds: string[],
        relevantTopicIds: string[]
    };
    recordingDetails: {
        locationDescription: string,
        location: {
            latitude: double,
            longitude: double,
            altitude: double
        },
        recordingDate: datetime
    };
    fileDetails: {
        fileName: string,
        fileSize: unsignedlong,
        fileType: string,
        container: string,
        videoStreams: [
            {
                widthPixels: unsignedinteger,
                heightPixels: unsignedinteger,
                frameRateFps: double,
                aspectRatio: double,
                codec: string,
                bitrateBps: unsignedlong,
                rotation: string,
                vendor: string
            }
        ],
        audioStreams: [
            {
                channelCount: unsignedinteger,
                codec: string,
                bitrateBps: unsignedlong,
                vendor: string
            }
        ],
        durationMs: unsignedlong,
        bitrateBps: unsignedlong,
        creationTime: string
    };
    processingDetails: {
        processingStatus: string,
        processingProgress: {
            partsTotal: unsignedlong,
            partsProcessed: unsignedlong,
            timeLeftMs: unsignedlong
        },
        processingFailureReason: string,
        fileDetailsAvailability: string,
        processingIssuesAvailability: string,
        tagSuggestionsAvailability: string,
        editorSuggestionsAvailability: string,
        thumbnailsAvailability: string
    };
    suggestions: {
        processingErrors: string[],
        processingWarnings: string[],
        processingHints: string[],
        tagSuggestions: [
            {
                tag: string,
                categoryRestricts: string[]
            }
        ],
        editorSuggestions: string[]
    };
    liveStreamingDetails: {
        actualStartTime: datetime,
        actualEndTime: datetime,
        scheduledStartTime: datetime,
        scheduledEndTime: datetime,
        concurrentViewers: unsignedlong,
        activeLiveChatId: string
    };
    localizations: {
        [key: string]: {
            title: string,
            description: string
        }
    };
}

export interface IVideoListResponse {
    kind: "youtube#videoListResponse";
    etag: etag;
    nextPageToken: string;
    prevPageToken: string;
    pageInfo: {
        totalResults: integer,
        resultsPerPage: integer
    };
    items: IVideo[];
}
