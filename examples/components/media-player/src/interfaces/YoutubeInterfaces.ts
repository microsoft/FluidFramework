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

export interface ISummaryCardData {
    id: string;
    image?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageAlternateText?: string;
    aspectRatio?: string;
    title?: string;
    titleDangerousHtml?: string;
    subtitle?: string;
    subtitleDangerousHtml?: string;
    text?: string;
    textDangerousHtml?: string;
    attribution?: string;
    attributionDangerousHtml?: string;
    starRating?: number;
    reviewCount?: number;
    viewCount?: number;
    upVoteCount?: number;
    commentCount?: number;
    data?: any;
    clickAction?: (data: ISummaryCardData) => void;
}

export const PlaylistIds = {
    popular: 'PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-',
    sharedAndLiked: 'PLrEnWoR732-BddQaHT4O-FOeaGyicL_ER',
    popularMusicVideos: 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    newMusicThisWeek: 'PLFgquLnL59alW3xmYiWRaoz0oM3H17Lth',
    sportsTopStories: 'PL8fVUTBmJhHKxzPO1xeA3PB8NM05B3Ln4',

    isValid(playlist: string) {
        return playlist &&
            (playlist === PlaylistIds.popular
                || playlist === PlaylistIds.sharedAndLiked
                || playlist === PlaylistIds.popularMusicVideos
                || playlist === PlaylistIds.newMusicThisWeek
                || playlist === PlaylistIds.sportsTopStories);
    }
};

export const Theme = {
    brandColor: '#e62117',
    brandTextColor: '#ffffff'
};

// Youtube entity definitions

export interface IPlaylists {
    kind: 'youtube#playlist';
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
        defaultLanguage: string,
        localized: {
            title: string,
            description: string
        }
    };
    status: {
        privacyStatus: string
    };
    contentDetails: {
        itemCount: unsignedinteger
    };
    player: {
        embedHtml: string
    };
    localizations: {
        [key: string]: {
            title: string,
            description: string
        }
    };
}

export interface IPlaylistItem {
    kind: 'youtube#playlistItem';
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
        playlistId: string,
        position: unsignedinteger,
        resourceId: {
            kind: string,
            videoId: string
        }
    };
    contentDetails: {
        videoId: string,
        startAt: string,
        endAt: string,
        note: string
    };
    status: {
        privacyStatus: string
    };
}

export interface ISearchResult {
    kind: 'youtube#searchResult';
    etag: etag;
    id: {
        kind: string,
        videoId: string,
        channelId: string,
        playlistId: string
    };
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
        liveBroadcastContent: string
    };
}

export interface IChannel {
    kind: 'youtube#channel';
    etag: etag;
    id: string;
    snippet: {
        title: string,
        description: string,
        customUrl: string,
        publishedAt: datetime,
        thumbnails: {
            [key: string]: {
                url: string,
                width: unsignedinteger,
                height: unsignedinteger
            }
        },
        defaultLanguage: string,
        localized: {
            title: string,
            description: string
        },
        country: string
    };
    contentDetails: {
        relatedPlaylists: {
            likes: string,
            favorites: string,
            uploads: string,
            watchHistory: string,
            watchLater: string
        }
    };
    statistics: {
        viewCount: unsignedlong,
        commentCount: unsignedlong,
        subscriberCount: unsignedlong,
        hiddenSubscriberCount: boolean,
        videoCount: unsignedlong
    };
    topicDetails: {
        topicIds: string[]
    };
    status: {
        privacyStatus: string,
        isLinked: boolean,
        longUploadsStatus: string
    };
    brandingSettings: {
        channel: {
            title: string,
            description: string,
            keywords: string,
            defaultTab: string,
            trackingAnalyticsAccountId: string,
            moderateComments: boolean,
            showRelatedChannels: boolean,
            showBrowseView: boolean,
            featuredChannelsTitle: string,
            featuredChannelsUrls: string[],
            unsubscribedTrailer: string,
            profileColor: string,
            defaultLanguage: string,
            country: string
        },
        watch: {
            textColor: string,
            backgroundColor: string,
            featuredPlaylistId: string
        },
        image: {
            bannerImageUrl: string,
            bannerMobileImageUrl: string,
            watchIconImageUrl: string,
            trackingImageUrl: string,
            bannerTabletLowImageUrl: string,
            bannerTabletImageUrl: string,
            bannerTabletHdImageUrl: string,
            bannerTabletExtraHdImageUrl: string,
            bannerMobileLowImageUrl: string,
            bannerMobileMediumHdImageUrl: string,
            bannerMobileHdImageUrl: string,
            bannerMobileExtraHdImageUrl: string,
            bannerTvImageUrl: string,
            bannerTvLowImageUrl: string,
            bannerTvMediumImageUrl: string,
            bannerTvHighImageUrl: string,
            bannerExternalUrl: string
        },
        hints: [
            {
                property: string,
                value: string
            }
        ]
    };
    invideoPromotion: {
        defaultTiming: {
            type: string,
            offsetMs: unsignedlong,
            durationMs: unsignedlong
        },
        position: {
            type: string,
            cornerPosition: string
        },
        items: [
            {
                id: {
                    type: string,
                    videoId: string,
                    websiteUrl: string,
                    recentlyUploadedBy: string
                },
                timing: {
                    type: string,
                    offsetMs: unsignedlong,
                    durationMs: unsignedlong
                },
                customMessage: string,
                promotedByContentOwner: boolean
            }
        ],
        useSmartTiming: boolean
    };
    auditDetails: {
        overallGoodStanding: boolean,
        communityGuidelinesGoodStanding: boolean,
        copyrightStrikesGoodStanding: boolean,
        contentIdClaimsGoodStanding: boolean
    };
    contentOwnerDetails: {
        contentOwner: string,
        timeLinked: datetime
    };
    localizations: {
        [key: string]: {
            title: string,
            description: string
        }
    };
}

export interface IVideo {
    kind: 'youtube#video';
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
    kind: 'youtube#videoListResponse';
    etag: etag;
    nextPageToken: string;
    prevPageToken: string;
    pageInfo: {
        totalResults: integer,
        resultsPerPage: integer
    };
    items: IVideo[];
}
