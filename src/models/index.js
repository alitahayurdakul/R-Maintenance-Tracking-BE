import mongoose from "mongoose";

const { Schema, model } = mongoose;

const stamps = { timestamps: true };

/* ------------------------------------------------------------------ access */

const roleSchema = new Schema(
  {
    roleName: { type: String, required: true, trim: true },
    roleDescription: { type: String, default: "" },
    // Strings of the form "<resource>:<action>", e.g. "activeProcess:manage".
    permissions: { type: [String], default: [] },
    creator: String,
    editor: String,
  },
  stamps,
);

const userSchema = new Schema(
  {
    fullname: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    phone: { type: String, default: "" },
    department: { type: String, default: "" },
    role: { type: Schema.Types.ObjectId, ref: "Role" },
    isActive: { type: Boolean, default: true },
    // Set by the forgot-password flow; both cleared once the password changes.
    resetCode: String,
    resetCodeExpiresAt: Date,
    creator: String,
    editor: String,
  },
  stamps,
);

/* ------------------------------------------------------------- rolling stock */

const wagonSchema = new Schema(
  {
    wagonNo: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    order: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    creator: String,
    editor: String,
  },
  stamps,
);

/**
 * The wagon set every train of a type carries. Wagons hang off the type rather
 * than off each train, so "these trains have the same wagons" is guaranteed by
 * the model instead of by two trains happening to share a wagon record.
 */
const trainTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, default: "" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    wagons: [
      {
        _id: false,
        wagon: { type: Schema.Types.ObjectId, ref: "Wagon", required: true },
        order: { type: Number, default: 1 },
      },
    ],
    creator: String,
    editor: String,
  },
  stamps,
);

const trainSchema = new Schema(
  {
    trainSetNo: { type: String, required: true, trim: true },
    desc: { type: String, default: "" },
    trainModel: { type: String, default: null },
    year: Number,
    trainType: { type: Schema.Types.ObjectId, ref: "TrainType", default: null },
    // Kept for trains created before types existed; the type wins when set.
    wagons: [
      {
        _id: false,
        wagon: { type: Schema.Types.ObjectId, ref: "Wagon", required: true },
        order: { type: Number, default: 1 },
      },
    ],
    creator: String,
    editor: String,
  },
  stamps,
);

/* ------------------------------------------------------------------- catalog */

const materialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    materialCode: { type: String, default: "" },
    serialNumber: { type: String, default: "" },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    creator: String,
    editor: String,
  },
  stamps,
);

const subStageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    materials: [{ type: Schema.Types.ObjectId, ref: "Material" }],
    creator: String,
    editor: String,
  },
  stamps,
);

const stageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    plannedOrder: { type: Number, default: null },
    isActive: { type: Boolean, default: true },
    materials: [{ type: Schema.Types.ObjectId, ref: "Material" }],
    subStages: [{ type: Schema.Types.ObjectId, ref: "SubStage" }],
    creator: String,
    editor: String,
  },
  stamps,
);

/** A workflow is stored under the "favorite-processes" route for historic reasons. */
const workflowSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    stages: [
      {
        _id: false,
        stageInfo: { type: Schema.Types.ObjectId, ref: "Stage", required: true },
        plannedOrder: { type: Number, default: 1 },
      },
    ],
    creator: String,
    editor: String,
  },
  stamps,
);

const reasonSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    creator: String,
    editor: String,
  },
  stamps,
);

/* ------------------------------------------------------------------ projects */

/**
 * What a project intends to do, captured when it is set up.
 *
 * The targets are derived from this rather than typed in: a job marked TRAIN
 * counts once per train, one marked WAGON once per (train, wagon) pair, minus
 * the pairs listed in `exclusions`.
 */
const projectPlanSchema = new Schema(
  {
    _id: false,
    trainType: { type: Schema.Types.ObjectId, ref: "TrainType", default: null },
    trains: [{ type: Schema.Types.ObjectId, ref: "Train" }],
    wagons: [{ type: Schema.Types.ObjectId, ref: "Wagon" }],
    items: [
      {
        _id: false,
        workflow: { type: Schema.Types.ObjectId, ref: "Workflow", required: true },
        scope: { type: String, enum: ["TRAIN", "WAGON"], default: "WAGON" },
      },
    ],
    // "<trainId>:<wagonId>" -> workflow ids switched off for that one pair.
    exclusions: { type: Map, of: [String], default: undefined },
    materials: [{ type: Schema.Types.ObjectId, ref: "Material" }],
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    projectCode: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ACTIVE", "IN_PROGRESS", "COMPLETED"],
      default: "ACTIVE",
    },
    description: { type: String, default: "" },
    // Kept for projects created before plans existed; a plan overrides them.
    totalTrainCount: { type: Number, default: null },
    totalSubStagePerTrain: { type: Number, default: null },
    plan: { type: projectPlanSchema, default: null },
    creator: String,
    lastUpdatedBy: String,
  },
  stamps,
);

/* ----------------------------------------------------------------- processes */

const subStageEntrySchema = new Schema(
  {
    subStageId: { type: Schema.Types.ObjectId, ref: "SubStage", required: true },
    name: String,
    description: { type: String, default: "" },
    // 0 pending, 1 running, 2 done - the frontend renders either form.
    status: { type: Number, default: 0 },
    start: { type: Date, default: null },
    end: { type: Date, default: null },
    images: { type: [String], default: [] },
    materials: [{ type: Schema.Types.ObjectId, ref: "Material" }],
    delayReasons: [{ type: Schema.Types.ObjectId, ref: "Reason" }],
  },
  { timestamps: true },
);

const stageEntrySchema = new Schema(
  {
    stageId: { type: Schema.Types.ObjectId, ref: "Stage", required: true },
    stageName: String,
    plannedOrder: { type: Number, default: 1 },
    operator: { type: String, default: "" },
    canSkip: { type: Boolean, default: false },
    isSkipped: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    subStages: [subStageEntrySchema],
  },
  { timestamps: true },
);

const processSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    train: { type: Schema.Types.ObjectId, ref: "Train", required: true },
    wagon: { type: Schema.Types.ObjectId, ref: "Wagon", default: null },
    workflow: { type: Schema.Types.ObjectId, ref: "Workflow", required: true },
    description: { type: String, default: "" },
    fleetOwner: { type: String, default: "" },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    entries: [stageEntrySchema],
    creator: String,
    editor: String,
  },
  stamps,
);

// One live process per (project, train, wagon, workflow): starting the same job
// twice on the same wagon is the duplicate the plan exists to prevent. Deleting
// a process frees the slot, which is how a failed job is repeated.
processSchema.index(
  { project: 1, train: 1, wagon: 1, workflow: 1 },
  { unique: true, partialFilterExpression: { status: { $ne: "CANCELLED" } } },
);

export const Role = model("Role", roleSchema);
export const User = model("User", userSchema);
export const Wagon = model("Wagon", wagonSchema);
export const TrainType = model("TrainType", trainTypeSchema);
export const Train = model("Train", trainSchema);
export const Material = model("Material", materialSchema);
export const SubStage = model("SubStage", subStageSchema);
export const Stage = model("Stage", stageSchema);
export const Workflow = model("Workflow", workflowSchema);
export const Reason = model("Reason", reasonSchema);
export const Project = model("Project", projectSchema);
export const Process = model("Process", processSchema);
