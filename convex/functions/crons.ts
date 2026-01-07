import { cronJobs } from "convex/server";
import { api } from "../_generated/api";

const crons = cronJobs();

// Schedule cleanup every 10 minutes
crons.interval(
  "cleanup_expired_drafts",
  { minutes: 10 },
  api.drafts.cleanupExpiredDrafts // Reference the mutation, don't inline code
);

export default crons;