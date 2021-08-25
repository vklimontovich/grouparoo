import { CLSTask } from "../../classes/tasks/clsTask";
import { CLS } from "../../modules/cls";
import { Source } from "../../models/Source";
import { plugin } from "../../modules/plugin";
import { RecordPropertyOps } from "../../modules/ops/recordProperty";
import { api, env } from "actionhero";

export class RecordPropertiesEnqueue extends CLSTask {
  constructor() {
    super();
    this.name = "recordProperties:enqueue";
    this.description =
      "Enqueue a batch of GrouparooRecords who need a GrouparooRecord Property";
    this.frequency = 1000 * 10;
    this.queue = "recordProperties";
    this.inputs = {};
  }

  async runWithinTransaction(worker) {
    let count = 0;
    const limit = parseInt(
      (await plugin.readSetting("core", "imports-record-properties-batch-size"))
        .value
    );

    const sources = await Source.findAll();

    for (const source of sources) {
      try {
        const pendingRecordPropertyIds =
          await RecordPropertyOps.processPendingRecordProperties(source, limit);

        count = count + pendingRecordPropertyIds.length;
      } catch (error) {
        if (env === "test") console.error(error);

        // this is a periodic task, and will be retried
        api.exceptionHandlers.task(error, this.queue, worker.job, worker.id);
      }
    }

    // re-enqueue if there is more to do
    if (count > 0) await CLS.enqueueTask(this.name, {});

    return count;
  }
}
