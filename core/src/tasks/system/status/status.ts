import { api, log, task } from "actionhero";
import { GrouparooCLI } from "../../../modules/cli";
import { APM } from "../../../modules/apm";
import { Status, FinalSummary } from "../../../modules/status";
import { plugin } from "../../../modules/plugin";
import { CLSTask } from "../../../classes/tasks/clsTask";

export class StatusTask extends CLSTask {
  constructor() {
    super();
    this.name = "status";
    this.description =
      "Calculate and store status.  If we are running via the CLI, log it there too";
    this.frequency = 1000 * 5; // every 5 seconds by default, but will be modified by `updateTaskFrequency` after the first run
    this.queue = "system";
    this.inputs = {
      toStop: { required: false },
    };
  }

  async runWithinTransaction({ toStop }: { toStop: boolean }, worker) {
    return APM.wrap(this.name, "task", worker, async () => {
      const runMode = process.env.GROUPAROO_RUN_MODE;

      if (runMode === "cli:run") {
        // calculate stats inline
        await Status.setAll();
      } else {
        // distribute stats calculation
        Status.statusSampleReporters.forEach(async (_, idx) => {
          await task.enqueue("status:sample", { index: idx });
        });
      }

      const samples = await this.getSamples();
      if (runMode === "cli:run") this.logSamples(samples);

      const complete = await this.checkForComplete(samples);

      if (runMode === "cli:run" && complete) {
        await this.logFinalSummary();
        await this.stopServer(toStop);
      }

      await this.updateTaskFrequency();
    });
  }

  async logFinalSummary() {
    if (process.env.NODE_ENV === "test") return;

    const finalSummaryLog = await FinalSummary.getFinalSummary();
    GrouparooCLI.logger.finalSummary(finalSummaryLog);
  }

  async checkForComplete(samples: Status.StatusGetResponse) {
    let pendingItems = 0;
    let pendingCollections = 0;

    for (const topic in samples) {
      for (const collection in samples[topic]) {
        const metrics = samples[topic][collection];
        const { metric } = metrics[metrics.length - 1];
        if (
          metric.collection === "pending" ||
          metric.collection === "deleted"
        ) {
          pendingItems += metric.count;
          pendingCollections++;
        }
      }
    }

    if (pendingCollections < 4) return false; // not every required model has been checked yet (PENDING: profile, runs, import, export)
    return pendingItems > 0 ? false : true;
  }

  async stopServer(toStop = true) {
    log("All Tasks Complete!", "notice");
    if (!toStop) return false;

    // do not await so the promise can end so the server can shut down
    new Promise(async () => {
      await api.process.stop();

      process.nextTick(() => process.exit(0));
    });
  }

  async getSamples() {
    const samples = await Status.get();
    return samples;
  }

  logSamples(samples: Status.StatusGetResponse) {
    if (process.env.NODE_ENV === "test") return;

    const totalItems = [];
    const pendingItems = [];
    const pendingRuns = [];
    const pendingDeletions = [];

    const pendingCollection = samples["Run"]
      ? samples["Run"]["pending"]
      : undefined;
    const activeRunIds: string[] = pendingCollection
      ? JSON.parse(
          pendingCollection[pendingCollection.length - 1]?.metric?.value
        ) ?? []
      : [];

    for (const topic in samples) {
      for (const collection in samples[topic]) {
        const metrics = samples[topic][collection];
        const { metric: latestMetric, timestamp: latestTimestamp } =
          metrics[metrics.length - 1];

        if (latestMetric.collection === "totals") {
          totalItems.push({
            [latestMetric.topic]: [latestMetric.count],
          });
        }

        if (latestMetric.collection === "pending") {
          pendingItems.push({
            [latestMetric.topic]: [latestMetric.count],
          });
        }

        if (latestMetric.collection === "deleted" && latestMetric.count > 0) {
          pendingDeletions.push({
            [latestMetric.topic]: [latestMetric.count],
          });
        }

        if (
          latestMetric.topic === "Run" &&
          latestMetric.collection === "percentComplete"
        ) {
          metrics.forEach(({ metric, timestamp }) => {
            if (
              activeRunIds.includes(metric.key) &&
              latestTimestamp === timestamp
            ) {
              pendingRuns.push({
                [metric.value]: [
                  `${metric.count}%${
                    metric.metadata ? ` (${metric.metadata})` : ""
                  }`,
                ],
              });
            }
          });
        }
      }
    }

    const logItems = [];
    if (totalItems.length > 0) {
      logItems.push({
        header: "Total Items",
        status: totalItems.reduce((s, arr) => Object.assign(s, arr), {}),
      });
    }
    if (pendingItems.length > 0) {
      logItems.push({
        header: "Pending Items",
        status: pendingItems.reduce((s, arr) => Object.assign(s, arr), {}),
      });
    }
    if (pendingRuns.length > 0) {
      logItems.push({
        header: "Active Runs",
        status: pendingRuns.reduce((s, arr) => Object.assign(s, arr), {}),
      });
    }
    if (pendingDeletions.length > 0) {
      logItems.push({
        header: "Pending Deletions",
        status: pendingDeletions.reduce((s, arr) => Object.assign(s, arr), {}),
      });
    }

    if (logItems.length > 0) GrouparooCLI.logger.status("Status", logItems);
  }

  async updateTaskFrequency() {
    const frequency =
      parseInt(
        (
          await plugin.readSetting(
            "interface",
            "status-calculation-frequency-seconds"
          )
        ).value
      ) * 1000;

    api.tasks.tasks["status"].frequency = frequency;
  }
}
