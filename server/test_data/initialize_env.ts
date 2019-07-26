import { env } from "./routes.spec.data";

export class InitializeEnv {

    init() {
        process.env.APP_BASE_URL = env.APP_BASE_URL;
        process.env.CHANNEL = env.CHANNEL;
        process.env.APP_BASE_URL_TOKEN = env.APP_BASE_URL_TOKEN;
        process.env.DATABASE_PATH = env.DATABASE_PATH;
        process.env.FILES_PATH = env.FILES_PATH;
        process.env.APP_ID = env.APP_ID;
        process.env.APPLICATION_PORT = env.APPLICATION_PORT;
        process.env.TELEMETRY_SYNC_INTERVAL_IN_SECS = env.TELEMETRY_SYNC_INTERVAL_IN_SECS;
        process.env.TELEMETRY_PACKET_SIZE = env.TELEMETRY_PACKET_SIZE;
        process.env.APP_NAME = env.APP_NAME;
        process.env.MODE = env.MODE;
    }
}




