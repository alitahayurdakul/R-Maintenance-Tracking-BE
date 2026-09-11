import { Log } from "../models/index.js";

/**
 * The action keys the logs page knows about (the frontend's LOG_ACTIONS).
 * Anything outside this list renders with a neutral badge, so the writer stays
 * in step with it rather than inventing names.
 */
export const LOG_ACTIONS = {
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DELETE: "USER_DELETE",
  USER_PASSWORD_CHANGE: "USER_PASSWORD_CHANGE",
  AUTH_LOGIN: "AUTH_LOGIN",
  AUTH_LOGOUT: "AUTH_LOGOUT",
  ROLE_CREATE: "ROLE_CREATE",
  ROLE_UPDATE: "ROLE_UPDATE",
  ROLE_DELETE: "ROLE_DELETE",
  PROCESS_START: "PROCESS_START",
  PROCESS_COMPLETE: "PROCESS_COMPLETE",
  PROCESS_DELETE: "PROCESS_DELETE",
  STAGE_START: "STAGE_START",
  STAGE_COMPLETE: "STAGE_COMPLETE",
  SUB_STAGE_COMPLETE: "SUB_STAGE_COMPLETE",
  WORKFLOW_CREATE: "WORKFLOW_CREATE",
  WORKFLOW_UPDATE: "WORKFLOW_UPDATE",
  PROJECT_CREATE: "PROJECT_CREATE",
  TRAIN_CREATE: "TRAIN_CREATE",
  TRAIN_DELETE: "TRAIN_DELETE",
  WAGON_CREATE: "WAGON_CREATE",
  MATERIAL_DELETE: "MATERIAL_DELETE",
  REASON_CREATE: "REASON_CREATE",
};

/**
 * Records an operation against the caller.
 *
 * Deliberately fire-and-forget: an audit row must never turn a successful
 * operation into a failed response, so a write that fails is logged to the
 * console and swallowed.
 */
export const audit = (req, action, extra = {}) => {
  const user = req?.user ?? {};

  Log.create({
    action,
    userId: extra.userId ?? user.id ?? "",
    fullname: extra.fullname ?? user.fullname ?? "",
    operationTime: new Date(),
  }).catch((err) => console.error("[audit] could not record", action, err.message));
};

/** Maps a catalog path to the action names the logs page recognises. */
export const CATALOG_ACTIONS = {
  "/api/materials": { delete: LOG_ACTIONS.MATERIAL_DELETE },
  "/api/reasons": { create: LOG_ACTIONS.REASON_CREATE },
  "/api/roles": {
    create: LOG_ACTIONS.ROLE_CREATE,
    update: LOG_ACTIONS.ROLE_UPDATE,
    delete: LOG_ACTIONS.ROLE_DELETE,
  },
  "/api/favorite-processes": {
    create: LOG_ACTIONS.WORKFLOW_CREATE,
    update: LOG_ACTIONS.WORKFLOW_UPDATE,
  },
};
