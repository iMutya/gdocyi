import { cronJobs } from "convex/server";
import { api } from "../_generated/api";

const crons = cronJobs();

crons.interval(
  "cleanup_expired_drafts",
  { minutes: 10 },
  api.drafts.cleanupExpiredDrafts 
);

export default crons;