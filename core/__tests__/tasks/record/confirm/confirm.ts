import { helper } from "@grouparoo/spec-helper";
import Moment from "moment";
import { api, task, specHelper } from "actionhero";
import {
  Import,
  plugin,
  GrouparooRecord,
  RecordProperty,
  Property,
  Run,
  Schedule,
  Source,
} from "../../../../src";

describe("tasks/records:confirm", () => {
  helper.grouparooTestServer({
    truncate: true,
    enableTestPlugin: true,
    disableTestPluginImport: true,
  });

  let directlyMappedProperty: Property;

  beforeEach(async () => await api.resque.queue.connection.redis.flushdb());
  beforeAll(async () => {
    await helper.factories.properties();
    directlyMappedProperty = await Property.findOne({
      where: { key: "userId" },
    });
  });

  afterEach(async () => {
<<<<<<< HEAD:core/__tests__/tasks/record/confirm/confirm.ts
    await plugin.updateSetting("core", "confirm-profiles-days", 7);
=======
    await plugin.updateSetting("core", "runs-record-batch-size", 100);
    await plugin.updateSetting("core", "confirm-records-days", 7);
>>>>>>> f11e94f87 (WIP core action tests):core/__tests__/tasks/record/confirm.ts
  });

  test("can be enqueued", async () => {
    await task.enqueue("records:confirm", {});
    const found = await specHelper.findEnqueuedTasks("records:confirm");
    expect(found.length).toEqual(1);
  });

  test("marks records and directlyMapped pending if they haven't been confirmed in a while", async () => {
    const staleProfile: GrouparooRecord = await helper.factories.record();
    const recentProfile: GrouparooRecord = await helper.factories.record();

    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(10, "days").toDate(),
      },
      {
        where: {
          recordId: staleProfile.id,
        },
      }
    );

    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(6, "days").toDate(),
      },
      {
        where: {
          recordId: recentProfile.id,
        },
      }
    );

    await GrouparooRecord.update(
      { state: "ready" },
      {
        where: {
          id: [staleProfile.id, recentProfile.id],
        },
      }
    );

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(1);

    await staleProfile.reload();
    await recentProfile.reload();

    expect(staleProfile.state).toBe("pending");
    expect(recentProfile.state).toBe("ready"); // dont need to confirm

    const pendingProfileProperties = await RecordProperty.findAll({
      where: {
        state: "pending",
        recordId: [staleProfile.id, recentProfile.id],
      },
    });
    expect(pendingProfileProperties.length).toBe(1);
    expect(pendingProfileProperties[0].propertyId).toBe(
      directlyMappedProperty.id // only the directlyMapped is marked pending
    );
    expect(pendingProfileProperties[0].recordId).toBe(staleProfile.id);

    const readyProfileProperties = await RecordProperty.findAll({
      where: {
        state: "ready",
        recordId: [staleProfile.id, recentProfile.id],
      },
    });
    expect(readyProfileProperties.length).toBe(9 + 8);

    await staleProfile.destroy();
    await recentProfile.destroy();
  });

  test("the amount of days can be configured", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 5);

    const record: GrouparooRecord = await helper.factories.record();
    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(6, "days").toDate(),
      },
      {
        where: {
          recordId: record.id,
        },
      }
    );
    await record.update({ state: "ready" });

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(1);

    await record.reload();
    expect(record.state).toBe("pending");

    const pendingProfileProperties = await RecordProperty.findAll({
      where: {
        recordId: record.id,
        state: "pending",
      },
    });

    expect(pendingProfileProperties.length).toBe(1);
    expect(pendingProfileProperties[0].propertyId).toBe(
      directlyMappedProperty.id
    );

    await record.destroy();
  });

  test("can disable confirming records by setting days to 0", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 0);

    const record: GrouparooRecord = await helper.factories.record();
    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(6, "days").toDate(),
      },
      {
        where: {
          recordId: record.id,
        },
      }
    );
    await record.update({ state: "ready" });

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(0);

    await record.reload();
    expect(record.state).toBe("ready");

    const pendingProfileProperties = await RecordProperty.findAll({
      where: {
        recordId: record.id,
        state: "pending",
      },
    });

    expect(pendingProfileProperties.length).toBe(0);

    await record.destroy();
  });

  test("marks records and directlyMapped pending that haven't been confirmed if the schedule has run and it's marked as confirmRecords=true", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 0);

    const source = await Source.findOne();
    const schedule: Schedule = await helper.factories.schedule(source, {
      confirmRecords: true,
    });
    const run: Run = await helper.factories.run(schedule, {
      state: "complete",
      completedAt: new Date(),
    });

    const record: GrouparooRecord = await helper.factories.record();
    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(1, "days").toDate(),
      },
      {
        where: {
          recordId: record.id,
        },
      }
    );
    await record.update({ state: "ready" });

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(1);

    await record.reload();
    expect(record.state).toBe("pending");

    const pendingProfileProperties = await RecordProperty.findAll({
      where: {
        recordId: record.id,
        state: "pending",
      },
    });

    expect(pendingProfileProperties.length).toBe(1);
    expect(pendingProfileProperties[0].propertyId).toBe(
      directlyMappedProperty.id
    );

    await record.destroy();
    await schedule.destroy();
  });

  test("does not mark records pending that haven't been confirmed if the schedule has run and it's marked as confirmRecords=false", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 0);

    const source = await Source.findOne();
    const schedule: Schedule = await helper.factories.schedule(source, {
      confirmRecords: false,
    });
    const run: Run = await helper.factories.run(schedule, {
      state: "complete",
      completedAt: new Date(),
    });

    const record: GrouparooRecord = await helper.factories.record();
    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(1, "days").toDate(),
      },
      {
        where: {
          recordId: record.id,
        },
      }
    );
    await record.update({ state: "ready" });

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(0);

    await record.reload();
    expect(record.state).toBe("ready");

    const pendingProfileProperties = await RecordProperty.findAll({
      where: {
        recordId: record.id,
        state: "pending",
      },
    });

    expect(pendingProfileProperties.length).toBe(0);

    await record.destroy();
    await schedule.destroy();
  });

  test("will wait for schedule run's imports to be associated before trying to confirm records", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 0);

    const source = await Source.findOne();
    const schedule: Schedule = await helper.factories.schedule(source, {
      confirmRecords: true,
    });
    const run: Run = await helper.factories.run(schedule, {
      state: "complete",
      completedAt: new Date(),
    });

    const record: GrouparooRecord = await helper.factories.record();
    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(1, "days").toDate(),
      },
      {
        where: {
          recordId: record.id,
        },
      }
    );
    await record.update({ state: "ready" });

    // create an unassociated import
    const _import: Import = await helper.factories.import(run);

    // try to confirm
    let count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(0); // nothing

    await record.reload();
    expect(record.state).toBe("ready");

    // associate the import
    await _import.update({
      recordId: "someId",
      profileAssociatedAt: new Date(),
    });

    // try to confirm again
    count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(1); // now we can confirm it

    await record.reload();
    expect(record.state).toBe("pending");

    await record.destroy();
    await schedule.destroy();
  });

  test("silently exists if the schedule has no runs", async () => {
    await plugin.updateSetting("core", "confirm-records-days", 0);

    const source = await Source.findOne();
    await helper.factories.schedule(source, {
      confirmRecords: true,
    });

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(0); // nothing
  });
<<<<<<< HEAD:core/__tests__/tasks/record/confirm/confirm.ts
=======

  test("only processes records up to the batch size", async () => {
    await plugin.updateSetting("core", "runs-record-batch-size", 2);

    const profile1: GrouparooRecord = await helper.factories.record();
    const profile2: GrouparooRecord = await helper.factories.record();
    const profile3: GrouparooRecord = await helper.factories.record();

    await RecordProperty.update(
      {
        state: "ready",
        confirmedAt: Moment().subtract(10, "days").toDate(),
      },
      {
        where: {
          recordId: [profile1.id, profile2.id, profile3.id],
        },
      }
    );

    await GrouparooRecord.update(
      { state: "ready" },
      {
        where: {
          id: [profile1.id, profile2.id, profile3.id],
        },
      }
    );

    const count = await specHelper.runTask("records:confirm", {});
    expect(count).toBe(2);

    await profile1.reload();
    await profile2.reload();
    await profile3.reload();

    const states = [profile1.state, profile2.state, profile3.state].sort();
    expect(states).toEqual(["pending", "pending", "ready"]);
  });
>>>>>>> f11e94f87 (WIP core action tests):core/__tests__/tasks/record/confirm.ts
});