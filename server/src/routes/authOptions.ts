export let google = {
    scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/calendar',
        'https://www.google.com/m8/feeds/'
    ],
    accessType: 'offline',
    prompt: 'consent'
}

export let microsoft = {
    scope: [
        'offline_access',
        'profile',
        'email',
        'User.Read',
        'User.ReadBasic.All',
        'Calendars.ReadWrite',
        'Contacts.Read'
    ]
}

export let facebook = {
    scope: [
        'public_profile',
        'email',
        'user_friends',
        'user_about_me',
        'publish_actions'
    ]
}

export let linkedin = {
    scope: [
        'r_basicprofile',
        'r_emailaddress',
        'w_share'
    ]
}