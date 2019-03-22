const config = {
    baseUrl: "https://dev.sunbirded.org/",
    resourceBundles: {
        url: "resourcebundles/v1/read/",
        files: ['en', 'hi', 'ur'],
        dest_folder: 'resourceBundles'
    },
    organizations: {
        url: "api/org/v1/search",
        ids: ["ORG_001"],
        dest_folder: 'organizations'
    },
    channels: {
        url: "api/channel/v1/read/",
        ids: ["b00bc992ef25f1a9a8d63291e20efc8d"],
        dest_folder: 'channels'
    },
    frameworks: {
        url: "api/framework/v1/read/",
        ids: ['NCFCOPY'],
        dest_folder: "frameworks"
    },
    forms: {
        url: "api/data/v1/form/read",
        requests_data: [
            {
                "type": "content",
                "action": "search",
                "subType": "resourcebundle",
                "rootOrgId": "b00bc992ef25f1a9a8d63291e20efc8d"
            },
            {
                "type": "content",
                "action": "search",
                "subType": "explore",
                "rootOrgId": "b00bc992ef25f1a9a8d63291e20efc8d"
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
                "filters":
                {
                    "channel": "b00bc992ef25f1a9a8d63291e20efc8d",
                    "board": ["NCERT"]
                },
                "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 },
                "mode": "soft"
            }
        ],
        dest_folder: "pages"
    }
}

export default config;