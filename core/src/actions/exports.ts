import { AuthenticatedAction } from "../classes/actions/authenticatedAction";
import { Export } from "../models/Export";
import { ExportOps } from "../modules/ops/export";
import { Destination } from "../models/Destination";
import { Op } from "sequelize";
import { APIData } from "../modules/apiData";

export class ExportsList extends AuthenticatedAction {
  constructor() {
    super();
    this.name = "exports:list";
    this.description = "list exports";
    this.outputExample = {};
    this.permission = { topic: "export", mode: "read" };
    this.inputs = {
      profileId: { required: false },
      destinationId: { required: false },
      exportProcessorId: { required: false },
      limit: { required: true, default: 100, formatter: APIData.ensureNumber },
      offset: { required: true, default: 0, formatter: APIData.ensureNumber },
      state: { required: false },
      order: {
        required: false,
        formatter: APIData.ensureObject,
        default: [["createdAt", "desc"]],
      },
    };
  }

  async runWithinTransaction({ params }) {
    const where = {};
    if (params.profileId) {
      where["profileId"] = params.profileId;
    }
    if (params.destinationId) {
      where["destinationId"] = params.destinationId;
    }
    if (params.exportProcessorId) {
      where["exportProcessorId"] = params.exportProcessorId;
    }
    if (params.state) {
      where["state"] = params.state;
    }

    const _exports = await Export.findAll({
      where,
      include: [{ model: Destination, where: { state: { [Op.ne]: "draft" } } }],
      limit: params.limit,
      offset: params.offset,
      order: params.order,
    });

    const total = await Export.count({ where });

    return {
      total,
      exports: await Promise.all(_exports.map((exp) => exp.apiData())),
    };
  }
}

export class ExportsTotals extends AuthenticatedAction {
  constructor() {
    super();
    this.name = "exports:totals";
    this.description = "count exports by state";
    this.outputExample = {};
    this.permission = { topic: "export", mode: "read" };
    this.inputs = {
      profileId: { required: false },
      destinationId: { required: false },
    };
  }

  async runWithinTransaction({ params }) {
    const where = {};
    if (params.profileId) {
      where["profileId"] = params.profileId;
    }
    if (params.destinationId) {
      where["destinationId"] = params.destinationId;
    }

    return { totals: await ExportOps.totals(where) };
  }
}

export class ExportView extends AuthenticatedAction {
  constructor() {
    super();
    this.name = "export:view";
    this.description = "view an export";
    this.outputExample = {};
    this.permission = { topic: "export", mode: "read" };
    this.inputs = {
      id: { required: true },
    };
  }

  async runWithinTransaction({ params }) {
    const _export = await Export.findById(params.id);
    return { export: await _export.apiData() };
  }
}
