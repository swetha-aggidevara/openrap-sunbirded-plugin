import { env } from "./routes.spec.data";

export class InitializeEnv {

    init() {
        for (let envId in env) {
            process.env[envId] = env[envId];
        }
    }
}




