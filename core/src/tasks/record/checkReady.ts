import { CLSTask } from "../../classes/tasks/clsTask";
import { RecordOps } from "../../modules/ops/record";
import { plugin } from "../../modules/plugin";

export class GrouparooRecordsCheckReady extends CLSTask {
  constructor() {
    super();
    this.name = "records:checkReady";
    this.description =
      "If all of a GrouparooRecord's Properties are ready, mark the record ready and complete the import";
    this.frequency = 1000 * 10;
    this.queue = "records";
    this.inputs = {};
  }

  async runWithinTransaction() {
    const limit = parseInt(
      (await plugin.readSetting("core", "runs-record-batch-size")).value
    );

    const toExport = process.env.GROUPAROO_DISABLE_EXPORTS
      ? process.env.GROUPAROO_DISABLE_EXPORTS !== "true"
      : true;

    await RecordOps.makeReadyAndCompleteImports(limit, toExport);
  }
}
