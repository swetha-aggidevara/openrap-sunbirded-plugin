import * as path from "path";

export const frameworkConfig = {
    db: {
        cassandra: {
            "contactPoints": [
                "127.0.0.1"
            ]
        },
        "elasticsearch": {
            "host": "127.0.0.1:9200",
            "disabledApis": [
                "cat",
                "cluster",
                "ingest",
                "nodes",
                "remote",
                "snapshot",
                "tasks"
            ]
        },
        "couchdb": {
            "url": 'http://localhost:5984'
        },
        "pouchdb": {
            "path": "./",
        }
    },
    plugins: [
        {
            id: "openrap-sunbirded-plugin", ver: "1.0"
        }
    ],
    pluginBasePath: path.join(__dirname, "../test") + "/"
}

export const env = {
    "APP_BASE_URL": "https://dev.sunbirded.org/",
    "CHANNEL": "sunbird",
    "TELEMETRY_SYNC_INTERVAL_IN_SECS": "30",
    "APP_ID": "local.sunbird.desktop",
    "TELEMETRY_PACKET_SIZE": "200",
    "APP_BASE_URL_TOKEN": "",
    "APP_NAME": "SUNBIRD",
    "MODE": "standalone",
    "APPLICATION_PORT": "9010",
    "DATABASE_PATH": "test_data/database",
    "FILES_PATH": "test_data"
}