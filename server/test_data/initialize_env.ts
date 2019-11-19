import { env } from "./routes.spec.data";
import * as fs from "fs";
import * as path from "path";

export class InitializeEnv {

    init() {
        for (let envId in env) {
            process.env[envId] = env[envId];
        }
        if(!fs.existsSync(path.join(__dirname,  'database'))) {
            fs.mkdirSync(path.join(__dirname,  'database'))
        }

    }
}




