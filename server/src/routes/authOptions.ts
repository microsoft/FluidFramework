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
        'User.ReadBasic.All',
        'Calendars.ReadWrite',
        'Contacts.Read'
    ]
}