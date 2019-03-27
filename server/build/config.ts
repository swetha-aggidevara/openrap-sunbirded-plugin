const config = {
    baseUrl: "https://diksha.gov.in/",
    resourceBundles: {
        url: "resourcebundles/v1/read/",
        files: ['en', 'hi'],
        dest_folder: 'resourceBundles'
    },
    organizations: {
        url: "api/org/v1/search",
        ids: ["ntp"],
        dest_folder: 'organizations'
    },
    channels: {
        url: "api/channel/v1/read/",
        ids: ["505c7c48ac6dc1edc9b08f21db5a571d"],
        dest_folder: 'channels'
    },
    frameworks: {
        url: "api/framework/v1/read/",
        ids: ['NCF'],
        dest_folder: "frameworks"
    },
    forms: {
        url: "api/data/v1/form/read",
        requests_data: [
            {
                "type": "content",
                "action": "search",
                "subType": "resourcebundle",
                "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d"
            },
            {
                "type": "content",
                "action": "search",
                "subType": "explore",
                "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d"
            }
        ],
        dest_folder: "forms"
    },
    pages: {
        url: "api/data/v1/page/assemble",
        requests_data: [
            {
                "source": "web",
                "name": "Explore",
                "filters": {
                    "channel": "505c7c48ac6dc1edc9b08f21db5a571d",
                    "board": ["CBSE"]
                },
                "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 },
                "mode": "soft"
            }
        ],
        dest_folder: "pages"
    }
}

export default config;