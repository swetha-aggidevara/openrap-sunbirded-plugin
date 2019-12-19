import { containerAPI } from "OpenRAP/dist/api";
const telemetryEnv = "Content";
const telemetryInstance = containerAPI.getTelemetrySDKInstance().getInstance();

export class TelemetryHelper {

    public logShareEvent(shareItems: object[], dir: string) {
        const telemetryEvent: any = {
            context: {
                env: telemetryEnv,
            },
            edata: {
                dir,
                type: "File",
                items: shareItems,
            },
        };
        telemetryInstance.share(telemetryEvent);
    }

}
