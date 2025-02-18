import os from "os";
import { api, env, task } from "actionhero";
import Sequelize from "sequelize";
import { getCoreVersion, getPluginManifest } from "../modules/pluginDetails";
import { Op } from "sequelize";
import { App } from "../models/App";
import { ApiKey } from "../models/ApiKey";
import { Source } from "../models/Source";
import { Schedule } from "../models/Schedule";
import { Destination } from "../models/Destination";
import { Import } from "../models/Import";
import { File } from "../models/File";
import { Group } from "../models/Group";
import { GroupRule } from "../models/GroupRule";
import { Export } from "../models/Export";
import { Profile } from "../models/Profile";
import { ProfileProperty } from "../models/ProfileProperty";
import { Property } from "../models/Property";
import { Run } from "../models/Run";
import { Team } from "../models/Team";
import { TeamMember } from "../models/TeamMember";
import { Notification } from "../models/Notification";
import { GroupOps } from "../modules/ops/group";
import { SourceOps } from "../modules/ops/source";
import { ProfileOps } from "./ops/profile";

export interface StatusMetric {
  // the possible attributes for a metric are:
  // { collection, topic, aggregation, key, value, count, min, max, avg, imports, exports, runs, errors }
  collection: string;
  topic: string;
  aggregation: "count" | "exact";
  key?: string;
  value?: string;
  count?: number;
  min?: number;
  max?: number;
  avg?: number;
  imports?: number;
  exports?: number;
  runs?: number;
  errors?: number;
  metadata?: string;
}

export namespace StatusReporters {
  export namespace Cluster {
    export namespace Workers {
      export async function countWorkers(): Promise<StatusMetric> {
        return {
          collection: "cluster",
          topic: "workers",
          aggregation: "count",
          count: Object.keys(await api.resque.queue.workers()).length,
        };
      }

      export async function countErrors(): Promise<StatusMetric> {
        return {
          collection: "cluster",
          topic: "resqueErrors",
          aggregation: "count",
          count: await api.resque.queue.failedCount(),
        };
      }

      export async function details(): Promise<StatusMetric> {
        const resqueDetails = await task.details();

        return {
          collection: "cluster",
          topic: "resqueDetails",
          aggregation: "exact",
          value: resqueDetails.leader || "None",
          metadata: JSON.stringify(resqueDetails),
        };
      }
    }

    export namespace OS {
      export async function exact(): Promise<StatusMetric> {
        return {
          collection: "cluster",
          topic: "os",
          aggregation: "exact",
          value: `${process.platform}/${os.release()}`,
        };
      }
    }

    export namespace NODE_ENV {
      export async function exact(): Promise<StatusMetric> {
        return {
          collection: "cluster",
          topic: "node_env",
          aggregation: "exact",
          value: env,
        };
      }
    }

    export namespace NOTIFICATIONS {
      export async function unread(): Promise<StatusMetric> {
        return {
          collection: "cluster",
          topic: "unreadNotifications",
          aggregation: "count",
          count: await Notification.count({ where: { readAt: null } }),
        };
      }
    }
  }

  export namespace Plugins {
    export async function Versions() {
      const metrics: StatusMetric[] = [];

      metrics.push({
        collection: "cluster",
        topic: "@grouparoo/core",
        aggregation: "exact",
        key: "version",
        value: getCoreVersion(),
      });

      const pluginManifest = getPluginManifest();
      pluginManifest.plugins.forEach((plugin) => {
        metrics.push({
          collection: "cluster",
          topic: plugin.name,
          aggregation: "exact",
          key: "version",
          value: plugin.version,
        });
      });

      return mergeMetrics(metrics);
    }
  }

  export namespace Totals {
    export async function Models(
      models = [
        App,
        ApiKey,
        Source,
        Schedule,
        Destination,
        Import,
        File,
        Group,
        GroupRule,
        Export,
        Profile,
        ProfileProperty,
        Property,
        Run,
        Team,
        TeamMember,
      ]
    ) {
      const metrics: StatusMetric[] = [];

      for (const i in models) {
        //@ts-ignore
        const model: typeof App = models[i]; // pick one of the Models so that the types are the same.  TODO: make this better
        metrics.push({
          collection: "totals",
          topic: model.name,
          aggregation: "count",
          count: await model.count(),
        });
      }

      return mergeMetrics(metrics);
    }

    export async function SourceTotals() {
      const metrics: StatusMetric[] = [];
      const sources = await Source.findAll();
      for (const i in sources) {
        const source = sources[i];
        const schedule = await source.$get("schedule");
        const { plugin } = await source.getPlugin();
        metrics.push({
          collection: "sourceTotals",
          topic: plugin.name,
          aggregation: "count",
          imports: schedule
            ? await Import.count({
                include: [{ model: Run, where: { creatorId: schedule.id } }],
              })
            : 0,
          runs: schedule
            ? await Run.count({ where: { creatorId: schedule.id } })
            : 0,
        });
      }

      return mergeMetrics(metrics);
    }

    export async function DestinationTotals() {
      const metrics: StatusMetric[] = [];

      const destinations = await Destination.findAll();
      for (const i in destinations) {
        const destination = destinations[i];
        const { plugin } = await destination.getPlugin();
        metrics.push({
          collection: "destinationTotals",
          topic: plugin.name,
          aggregation: "count",
          exports: await Export.count({
            where: { destinationId: destination.id },
          }),
        });
      }

      return mergeMetrics(metrics);
    }
  }

  export namespace Pending {
    export async function pendingRuns() {
      const metrics: StatusMetric[] = [];

      const activeRuns = await Run.findAll({ where: { state: "running" } });

      metrics.push({
        collection: "pending",
        topic: "Run",
        aggregation: "count",
        count: activeRuns.length,
        value: JSON.stringify(activeRuns.map((r) => r.id)),
      });

      for (const i in activeRuns) {
        const run = activeRuns[i];
        const creatorName = await run.getCreatorName();
        const percentComplete = run.percentComplete;
        const highWaterMark = run.highWaterMark
          ? Object.values(run.highWaterMark)[0]
          : run.groupHighWaterMark;

        metrics.push({
          collection: "percentComplete",
          topic: "Run",
          aggregation: "exact",
          key: run.id,
          value: creatorName,
          count: percentComplete,
          metadata: highWaterMark?.toString(),
        });
      }

      return metrics;
    }

    export async function pendingProfiles(): Promise<StatusMetric> {
      return {
        collection: "pending",
        topic: "Profile",
        aggregation: "count",
        count: await Profile.count({ where: { state: { [Op.ne]: "ready" } } }),
      };
    }

    export async function pendingImports(): Promise<StatusMetric> {
      return {
        collection: "pending",
        topic: "Import",
        aggregation: "count",
        count: await Import.count({ where: { exportedAt: null } }),
      };
    }

    export async function pendingImportsBySource() {
      const metrics: StatusMetric[] = [];
      const sources = await Source.findAll();
      const { counts } = await SourceOps.pendingImportsBySource();

      for (const source of sources) {
        metrics.push({
          collection: "pendingBySource",
          topic: "Import",
          aggregation: "count",
          key: source.id,
          value: source.name,
          count: counts[source.id] || 0,
        });
      }

      return metrics;
    }

    export async function pendingExports(): Promise<StatusMetric> {
      return {
        collection: "pending",
        topic: "Export",
        aggregation: "count",
        count: await Export.count({
          where: { state: "pending" },
        }),
      };
    }

    export async function pendingExportsByDestination() {
      const metrics: StatusMetric[] = [];
      const destinations = await Destination.findAll();

      for (const destination of destinations) {
        const apiData = await destination.apiData();
        metrics.push({
          collection: "pendingByDestination",
          topic: "Export",
          aggregation: "count",
          key: apiData.id,
          value: apiData.name,
          count: apiData.exportTotals.pending,
        });
      }

      return metrics;
    }
  }

  export namespace Deleted {
    export async function deletedGroups(): Promise<StatusMetric> {
      return {
        collection: "deleted",
        topic: "Group",
        aggregation: "count",
        count: await Group.count({
          where: { state: "deleted" },
        }),
      };
    }

    export async function deletedDestinations(): Promise<StatusMetric> {
      return {
        collection: "deleted",
        topic: "Destination",
        aggregation: "count",
        count: await Destination.count({
          where: { state: "deleted" },
        }),
      };
    }

    export async function deletedProperties(): Promise<StatusMetric> {
      return {
        collection: "deleted",
        topic: "Property",
        aggregation: "count",
        count: await Property.count({ where: { state: "deleted" } }),
      };
    }

    export async function deletedSources(): Promise<StatusMetric> {
      return {
        collection: "deleted",
        topic: "Source",
        aggregation: "count",
        count: await Source.count({ where: { state: "deleted" } }),
      };
    }

    export async function deletedProfiles(): Promise<StatusMetric> {
      const profilesToDestroy = await ProfileOps.getProfilesToDestroy();

      return {
        collection: "deleted",
        topic: "Profile",
        aggregation: "count",
        count: profilesToDestroy.length,
      };
    }
  }

  export async function deletedApps(): Promise<StatusMetric> {
    return {
      collection: "deleted",
      topic: "App",
      aggregation: "count",
      count: await App.count({ where: { state: "deleted" } }),
    };
  }

  export namespace Groups {
    export async function byNewestMember() {
      const metrics: StatusMetric[] = [];
      const { groups, newestMembersAdded } = await GroupOps.newestGroupMembers(
        25
      );

      for (const group of groups) {
        const apiData = await group.apiData();

        metrics.push({
          collection: "byNewestMember",
          topic: "Group",
          aggregation: "exact",
          key: apiData.id,
          value: apiData.name,
          count: apiData.profilesCount,
          metadata: newestMembersAdded[apiData.id]
            ? newestMembersAdded[apiData.id].toString()
            : "No Group Members",
        });
      }

      return metrics;
    }
  }

  export namespace Sources {
    export async function nextRuns() {
      const metrics: StatusMetric[] = [];
      const sources = await Source.findAll();

      for (const source of sources) {
        const schedule = await source.$get("schedule");
        const latestRun = schedule
          ? await Run.findOne({
              where: { creatorId: schedule.id },
              order: [["updatedAt", "desc"]],
            })
          : null;
        const nextRunAt = latestRun
          ? latestRun.updatedAt.getTime() + schedule.recurringFrequency
          : -1;

        metrics.push({
          collection: "nextRun",
          topic: "Source",
          aggregation: "exact",
          key: source.id,
          value: source.name,
          count: schedule?.recurring ? 1 : 0,
          metadata: nextRunAt.toString(),
        });
      }

      return metrics;
    }
  }
}

/*
 * Merge the counts from metrics with matching collections, topics, and aggregations.
 * This is useful for when you have 2 sources using the same app, and you want to report on the app's totals
 */
function mergeMetrics(metrics: StatusMetric[]) {
  var mergedMetrics: Array<StatusMetric> = [];
  metrics.forEach((item, idx) => {
    const found = mergedMetrics.some((el, i) => {
      if (i === idx) return false;
      return (
        el.collection === item.collection &&
        el.topic === item.topic &&
        el.aggregation === item.aggregation
      );
    });
    if (!found) {
      mergedMetrics.push(item);
    } else if (idx !== null) {
      for (const k in Object.keys(item)) {
        if (item.hasOwnProperty(k)) {
          mergedMetrics[idx].count = +item.count;
        }
      }
    }
  });

  return mergedMetrics;
}

export namespace FinalSummaryReporters {
  const lastRunStart = new Date(api.bootTime);
  export namespace Sources {
    export interface SourceData {
      name: string;
      profilesCreated: number;
      profilesImported: number;
      importsCreated: number;
      error: string;
    }
    export async function getData(): Promise<Array<SourceData>> {
      const runs = await Run.findAll({
        where: {
          updatedAt: { [Op.gte]: lastRunStart },
          creatorType: "schedule",
        },
      });

      const sources: { [id: string]: SourceData } = {};
      for (const run of runs) {
        let source = null;
        await run.updateTotals();
        const schedule = await Schedule.findByPk(run.creatorId);

        if (schedule) source = await schedule.$get("source", { scope: null });

        const currentSource = sources[source.id] || {
          name: source.name,
          profilesCreated: 0,
          profilesImported: 0,
          importsCreated: 0,
          error: null,
        };
        currentSource.profilesCreated += run.profilesCreated;
        currentSource.profilesImported += run.profilesImported;
        currentSource.importsCreated += run.importsCreated;
        currentSource.error = currentSource.error || run.error;
        sources[source.id] = currentSource;
      }

      return Object.values(sources);
    }
  }

  export namespace Profiles {
    export interface ProfileData {
      name: null;
      profilesUpdated: number;
      profilesCreated: number;
      allProfiles: number;
    }

    export async function getData() {
      const out: ProfileData[] = [];
      const profilesUpdated = await Profile.count({
        where: { updatedAt: { [Op.gte]: lastRunStart } },
      });

      const profilesCreated = await Profile.count({
        where: { createdAt: { [Op.gte]: lastRunStart } },
      });
      const name = null;
      const allProfiles = await Profile.count();

      const profileData = {
        name,
        profilesUpdated,
        profilesCreated,
        allProfiles,
      };
      out.push(profileData);
      return out;
    }
  }

  export namespace Destinations {
    export interface DestinationData {
      name: string;
      exportsCreated: number;
      exportsFailed: number;
      exportsComplete: number;
    }

    export async function getData() {
      const out: DestinationData[] = [];

      const exports = await Export.findAll({
        attributes: [
          "destinationId",
          [Sequelize.fn("count", Sequelize.col("id")), "exportsCreated"],
        ],
        where: { createdAt: { [Op.gte]: lastRunStart } },
        group: ["destinationId"],
      });
      for (const exp of exports) {
        const destination = await Destination.findById(exp.destinationId);

        const exportsFailed = await Export.count({
          where: {
            state: "failed",
            updatedAt: { [Op.gte]: lastRunStart },
            destinationId: destination.id,
          },
        });

        const exportsComplete = await Export.count({
          where: {
            state: "complete",
            updatedAt: { [Op.gte]: lastRunStart },
            destinationId: destination.id,
          },
        });

        const currentDestination = {
          name: destination.name,
          exportsCreated: exp.getDataValue("exportsCreated"),
          exportsFailed,
          exportsComplete,
        };

        out.push(currentDestination);
      }
      return out;
    }
  }

  export namespace Warnings {
    export interface WarningData {
      name: string;
      message: string;
      link: string;
    }

    export async function getWarnings() {
      const out: WarningData[] = [];

      const schedules = await Schedule.findAll();
      if (schedules.length === 0) {
        out.push({
          name: "Schedules",
          message: `No schedules found.  The run command uses schedules to know what profiles to import.`,
          link: `See this link for more info: https://www.grouparoo.com/docs/getting-started/product-concepts#schedule`,
        });
      }

      return out;
    }
  }
}
