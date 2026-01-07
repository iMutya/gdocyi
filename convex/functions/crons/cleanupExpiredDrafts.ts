// // convex/functions/crons.ts
// import { cronJobs } from "convex/server";
// import { cleanupExpiredDrafts } from "./mutations/drafts";

// const crons = cronJobs();

// // Schedule cleanup every 10 minutes
// crons.interval(
//   "cleanup_expired_drafts",
//   { minutes: 10 },
//   async (ctx) => {
//     // This is the same code as cleanupExpiredDrafts mutation
//     const now = Date.now();
//     const expiredDrafts = await ctx.db
//       .query("drafts")
//       .withIndex("by_expiry", (q) => q.lt("expiresAt", now))
//       .collect();

//     for (const draft of expiredDrafts) {
//       await ctx.db.delete("drafts", draft._id);
//     }
//   }
// );

// export default crons;
