import DatabaseSDK from "../../sdk/database";
import { Inject, Singleton } from "typescript-ioc";
import * as _ from 'lodash';

const TELEMETRY_PACKET_SIZE = 200;
@Singleton
export class TelemetrySyncManager {
  @Inject
  private databaseSdk: DatabaseSDK;
  pluginId;
  initialize(pluginId: string){
    this.databaseSdk.initialize(pluginId)
    this.pluginId = pluginId;
  }
  async createTelemetryPacket(){
    console.log('----------------------------------creating telemetryPackets-------------------------------');
    let dbFilters = {
      selector: {},
      limit: TELEMETRY_PACKET_SIZE * 10
    }
    const telemetryEvents = await this.databaseSdk.find('telemetry', dbFilters)
    .catch(error => console.log('fetching telemetryEvents failed', error));
    console.log('telemetry events length', telemetryEvents.docs.length);

    if(!telemetryEvents.docs.length){
      return;
    }
    const packets = _.chunk(telemetryEvents.docs, TELEMETRY_PACKET_SIZE).map(data => ({
      pluginId: this.pluginId,
      syncStatus: 'NOT_SYNCED',
      createdOn: Date.now(),
      events: data
    }));
    console.log('telemetry packets created', packets.length);
    await this.databaseSdk.bulk('telemetry_packets', packets)
    .catch(error => console.log('creating packets', error));

    const deleteEvents = _.map(telemetryEvents.docs, data => ({
      "_id" : data._id,
      "_rev": data._rev,
      "_deleted": true
    }))
    await this.databaseSdk.bulk('telemetry', deleteEvents)
    .catch(error => console.log('deleting telemetry events failed', error));
  }
}