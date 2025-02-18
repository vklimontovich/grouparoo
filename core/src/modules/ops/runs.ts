import { Run } from "../../models/Run";
import { Profile } from "../../models/Profile";
import { Group } from "../../models/Group";
import { Schedule } from "../../models/Schedule";
import { GroupMember } from "../../models/GroupMember";
import { Import } from "../../models/Import";
import { Op } from "sequelize";
import { log, api, task } from "actionhero";
import { Log } from "../../models/Log";

export namespace RunOps {
  /**
   * Return counts of the states of each import in N chunks over the lifetime of the run
   * Great for drawing charts!
   */
  export async function quantizedTimeline(run: Run, steps = 25) {
    const data = [];
    const start = run.createdAt.getTime();

    const lastExportedImport = await Import.findOne({
      where: { creatorId: run.id },
      order: [["exportedAt", "desc"]],
      limit: 1,
    });

    const lastImportedImport = await Import.findOne({
      where: { creatorId: run.id },
      order: [["profileUpdatedAt", "desc"]],
      limit: 1,
    });

    const end =
      lastExportedImport?.exportedAt?.getTime() ||
      lastImportedImport?.exportedAt?.getTime() ||
      run?.completedAt?.getTime() ||
      new Date().getTime();

    const stepSize = Math.floor((end - start) / steps);
    const boundaries = [start - stepSize * 2];
    let i = 1;
    let foundDestinationNames = [];
    while (i <= steps + 4) {
      const lastBoundary = boundaries[i - 1];
      const nextBoundary = lastBoundary + stepSize;
      boundaries.push(nextBoundary);

      const timeData = {
        lastBoundary,
        nextBoundary,
        steps: {
          associate: await run.$count("imports", {
            where: {
              profileAssociatedAt: {
                [Op.gte]: lastBoundary,
                [Op.lt]: nextBoundary,
              },
            },
          }),
          profilesUpdated: await run.$count("imports", {
            where: {
              profileUpdatedAt: {
                [Op.gte]: lastBoundary,
                [Op.lt]: nextBoundary,
              },
            },
          }),
          groupsUpdated: await run.$count("imports", {
            where: {
              groupsUpdatedAt: {
                [Op.gte]: lastBoundary,
                [Op.lt]: nextBoundary,
              },
            },
          }),
          exported: await run.$count("imports", {
            where: {
              exportedAt: {
                [Op.gte]: lastBoundary,
                [Op.lt]: nextBoundary,
              },
            },
          }),
        },
      };

      data.push(timeData);
      i++;
    }

    // add back points for destinations that were not found at this interval
    for (const i in data) {
      foundDestinationNames.forEach((destinationName) => {
        if (!data[i].steps[destinationName]) data[i].steps[destinationName] = 0;
      });
    }

    return data;
  }

  /**
   * Count up the totals from imports for `importsCreated`, `profilesCreated` and `profilesImported`
   */
  export async function updateTotals(run: Run) {
    const importsCreated = await Import.count({
      where: { creatorId: run.id },
    });
    const profilesCreated = await Import.count({
      where: { creatorId: run.id, createdProfile: true },
    });
    const profilesImported = await Import.count({
      where: { creatorId: run.id, profileUpdatedAt: { [Op.ne]: null } },
      distinct: true,
      col: "profileId",
    });

    const percentComplete = await run.determinePercentComplete(false, false);

    await run.update({
      importsCreated,
      profilesCreated,
      profilesImported,
      percentComplete,
    });
  }

  /**
   * Make a guess to what percent complete this Run is
   */
  export async function determinePercentComplete(run: Run) {
    await run.reload(); // the loaded instance's counts may have changed after it was loaded

    if (run.state === "complete") return 100;
    if (run.state === "stopped") return 100;

    if (run.creatorType === "group") {
      if (run.groupMethod === "complete") return 99;
      if (!run.groupMethod) return 0; // we are exporting the group to CSV or not yet set

      const group = await Group.findById(run.creatorId);
      let totalGroupMembers =
        group.type === "calculated"
          ? await group.countPotentialMembers()
          : await group.$count("groupMembers");

      const membersAlreadyUpdated = await GroupMember.count({
        where: {
          groupId: group.id,
          updatedAt: { [Op.gte]: run.createdAt },
        },
      });

      if (totalGroupMembers === 0 && membersAlreadyUpdated === 0) return 0;

      if (group.state === "deleted") {
        totalGroupMembers = await group.$count("groupMembers");

        const latestLogEntry = await Log.findOne({
          where: { ownerId: group.id },
          order: [["createdAt", "desc"]],
        });

        let latestProfilesCount = latestLogEntry?.data?.profilesCount ?? 0;
        if (latestProfilesCount === 0) latestProfilesCount = 1;

        return Math.floor(
          100 *
            ((latestProfilesCount - totalGroupMembers) / latestProfilesCount)
        );
      } else {
        // there are 3 phases to group runs, but only 2 really could have work, so we attribute 1/2 to each phase
        let percentComplete = Math.floor(
          100 *
            (membersAlreadyUpdated /
              (totalGroupMembers > 0 ? totalGroupMembers : 1))
        );

        if (!run.groupMethod.match(/remove/i)) {
          percentComplete = Math.floor(percentComplete / 2);
        } else {
          percentComplete = 49 + Math.floor(percentComplete / 2);
        }

        return percentComplete;
      }
    } else if (run.creatorType === "schedule") {
      const schedule = await Schedule.findById(run.creatorId);
      try {
        return schedule.runPercentComplete(run);
      } catch (error) {
        log(
          `Error calculating the percent complete for run ${run.id} (${schedule.name}): ${error}`,
          "error"
        );
        return 0;
      }
    } else {
      // for properties and for other types of internal run, we can assume we have to check every profile in the system
      const totalProfiles = await Profile.count();
      return Math.floor(
        100 * (run.importsCreated / (totalProfiles > 0 ? totalProfiles : 1))
      );
    }
  }

  /**
   * Is there already a task enqueued to process this run?
   */
  export async function isRunEnqueued(taskName: string, runId: string) {
    let found = [];

    // normal queues
    const queues = await api.resque.queue.queues();
    for (const i in queues) {
      const q = queues[i];
      const length = await api.resque.queue.length(q);
      const batchFound = await task.queued(q, 0, length + 1);
      const matches = batchFound.filter((t) => t.class === taskName);
      found = found.concat(matches);
    }

    // delayed queues
    const allDelayed = await api.resque.queue.allDelayed();
    for (const timestamp in allDelayed) {
      const matches = allDelayed[timestamp].filter((t) => t.class === taskName);
      found = found.concat(matches);
    }

    // working tasks
    const workingOn = await task.allWorkingOn();
    for (const worker in workingOn) {
      if (typeof workingOn[worker] === "string") continue;
      const payload = workingOn[worker].payload;
      if (payload.class === taskName) found = found.concat(payload);
    }

    return found.filter((t) => t.args[0].runId === runId).length > 0;
  }
}
