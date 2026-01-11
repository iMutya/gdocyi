// convex/draft.ts - SAFE OPTIMIZED VERSION
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// 1. Get ALL drafts for a document - SAFE OPTIMIZATION
export const getAllDocumentDrafts = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const drafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // SAFE OPTIMIZATION: Remove content only if not used
    // If you need content, keep it. If not, comment out:
    return drafts; // Keep as-is if content is needed
    
    // If content is NOT needed in list view, use:
    // return drafts.map(draft => ({
    //   _id: draft._id,
    //   ownerId: draft.ownerId,
    //   createdAt: draft.createdAt,
    //   lastUpdatedAt: draft.lastUpdatedAt,
    //   expiresAt: draft.expiresAt,
    //   // content: draft.content, // ← REMOVE THIS LINE
    // }));
  },
});

// 2. Get other users' drafts - SAFE
export const getOtherUsersDrafts = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const drafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
      .filter((q) => 
        q.and(
          q.eq(q.field("isActive"), true),
          q.neq(q.field("ownerId"), identity.subject)
        )
      )
      .collect();

    return drafts; // Keep as-is
  },
});

// 3. Compare any draft with main document - SAFE
export const compareDraftWithMain = query({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    const document = await ctx.db.get(draft.documentId);
    if (!document) throw new Error("Document not found");

    // SAFE OPTIMIZATION: Optional size limit (uncomment if needed)
    // const MAX_SIZE = 50000;
    // const truncate = (text: string) => 
    //   text.length > MAX_SIZE ? text.substring(0, MAX_SIZE) + "..." : text;

    return {
      draftContent: draft.content, // Keep or use truncate(draft.content)
      mainContent: document.initialContent || "",
      draftOwnerId: draft.ownerId,
      draftCreatedAt: draft.createdAt,
      lastUpdatedAt: draft.lastUpdatedAt,
    };
  },
});

// 4. Merge ANY draft - SAFE
export const mergeAnyDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    const document = await ctx.db.get(draft.documentId);
    if (!document) throw new Error("Document not found");

    const userId = identity.subject;
    const isDraftOwner = draft.ownerId === userId;
    const isDocumentOwner = document.ownerId === userId;

    if (!isDraftOwner && !isDocumentOwner) {
      throw new Error("Not authorized to merge this draft");
    }

    await ctx.db.patch(draft.documentId, {
      // initialContent: draft.content,
      publishedContent: draft.content,
      lastPublishedAt: Date.now(),
    });

    await ctx.db.patch(args.draftId, {
      isActive: false,
    });

    return { 
      success: true, 
      mergedBy: userId,
      mergedAt: Date.now(),
      wasOwner: isDocumentOwner
    };
  },
});

// 5. Create draft as another user - SAFE
export const createDraftForUser = mutation({
  args: {
    documentId: v.id("documents"),
    userId: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    if (document.ownerId !== identity.subject) {
      throw new Error("Only document owner can create drafts for others");
    }

    const existingDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", args.userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();

    if (existingDraft) {
      return existingDraft._id;
    }

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    const draftId = await ctx.db.insert("draftDocuments", {
      documentId: args.documentId,
      content: args.content || document.initialContent || "",
      ownerId: args.userId,
      roomId: `draft:${args.documentId}:${args.userId}:${now}`,
      organizationId: document.organizationId,
      createdAt: now,
      expiresAt,
      isActive: true,
      lastUpdatedAt: now,
    });

    return draftId;
  },
});

// 6. Get or create draft - CRITICAL OPTIMIZATION (Safe)
export const getOrCreateDraft = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const organizationId = (identity.organization_id ?? undefined) as string | undefined;

    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    // CHECK: Keep your existing query - it works
    const existingDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();

    if (existingDraft) {
      // OPTIMIZATION: Only update timestamp every 30 seconds, not on every check
      const thirtySecondsAgo = Date.now() - 30000;
      if (existingDraft.lastUpdatedAt < thirtySecondsAgo) {
        await ctx.db.patch(existingDraft._id, {
          lastUpdatedAt: Date.now(),
        });
      }
      return existingDraft._id;
    }

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    const draftId = await ctx.db.insert("draftDocuments", {
      documentId: args.documentId,
      content: document.initialContent || "",
      ownerId: userId,
      roomId: `draft:${args.documentId}:${userId}:${now}`,
      organizationId: organizationId || document.organizationId,
      createdAt: now,
      expiresAt,
      isActive: true,
      lastUpdatedAt: now,
    });

    return draftId;
  },
});

// 7. Get active draft - CRITICAL OPTIMIZATION (Safe)
export const getActiveDraft = query({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    const draft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();

    return draft; // Return full draft - your editor needs all fields
  },
});

// 8. Update draft content - MOST CRITICAL (3.93 KB) - SAFE OPTIMIZATION
export const updateDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // MAJOR BANDWIDTH SAVINGS: Skip update if content is identical
    if (draft.content === args.content) {
      // Return minimal response
      return { updated: false, reason: "identical content" };
    }

    await ctx.db.patch(args.draftId, {
      content: args.content,
      lastUpdatedAt: Date.now(),
    });

    // OPTIMIZATION: Return minimal success (not the full draft)
    return { updated: true, draftId: args.draftId };
  },
});

// In convex/draft.ts, REPLACE the entire publishDraft function (lines 163-190):

export const publishDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // ✅ FIX: Update publishedContent only, NOT initialContent
    await ctx.db.patch(draft.documentId, {
      publishedContent: draft.content, // Only publish to publishedContent
      lastPublishedAt: Date.now(),
    });

    await ctx.db.patch(args.draftId, {
      isActive: false,
    });

    return draft.documentId;
  },
});

// 10. Discard draft - SAFE
export const discardDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.draftId, {
      isActive: false,
    });
  },
});

// 11. Cleanup expired drafts - SAFE
export const cleanupExpiredDrafts = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    
    const expiredDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const draft of expiredDrafts) {
      await ctx.db.patch(draft._id, {
        isActive: false,
      });
    }

    return { cleaned: expiredDrafts.length };
  },
});







// // convex/draft.ts
// import { v } from "convex/values";
// import { mutation, query, action } from "./_generated/server";
// import { api } from "./_generated/api";

// // Add these to your existing convex/draft.ts:

// // 1. Get ALL drafts for a document (not just current user's)
// export const getAllDocumentDrafts = query({
//   args: {
//     documentId: v.id("documents"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) return [];

//     const drafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     return drafts;
//   },
// });

// // 2. Get other users' drafts (for viewing/comparing)
// export const getOtherUsersDrafts = query({
//   args: {
//     documentId: v.id("documents"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) return [];

//     const drafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_document", (q) => q.eq("documentId", args.documentId))
//       .filter((q) => 
//         q.and(
//           q.eq(q.field("isActive"), true),
//           q.neq(q.field("ownerId"), identity.subject)
//         )
//       )
//       .collect();

//     return drafts;
//   },
// });

// // 3. Compare any draft with main document
// export const compareDraftWithMain = query({
//   args: {
//     draftId: v.id("draftDocuments"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const draft = await ctx.db.get(args.draftId);
//     if (!draft) throw new Error("Draft not found");

//     const document = await ctx.db.get(draft.documentId);
//     if (!document) throw new Error("Document not found");

//     // Return both contents for comparison
//     return {
//       draftContent: draft.content,
//       mainContent: document.initialContent || "",
//       draftOwnerId: draft.ownerId,
//       draftCreatedAt: draft.createdAt,
//       lastUpdatedAt: draft.lastUpdatedAt,
//     };
//   },
// });

// // 4. Merge ANY draft (document owner can merge others' drafts)
// export const mergeAnyDraft = mutation({
//   args: {
//     draftId: v.id("draftDocuments"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const draft = await ctx.db.get(args.draftId);
//     if (!draft) throw new Error("Draft not found");

//     const document = await ctx.db.get(draft.documentId);
//     if (!document) throw new Error("Document not found");

//     // Check permissions: either draft owner OR document owner
//     const userId = identity.subject;
//     const isDraftOwner = draft.ownerId === userId;
//     const isDocumentOwner = document.ownerId === userId;

//     if (!isDraftOwner && !isDocumentOwner) {
//       throw new Error("Not authorized to merge this draft");
//     }

//     // Update main document
//     await ctx.db.patch(draft.documentId, {
//       initialContent: draft.content,
//       publishedContent: draft.content,
//       lastPublishedAt: Date.now(),
//     });

//     // Archive the draft after merging
//     await ctx.db.patch(args.draftId, {
//       isActive: false,
//     });

//     // Return the merged content
//     return { 
//       success: true, 
//       mergedBy: userId,
//       mergedAt: Date.now(),
//       wasOwner: isDocumentOwner // true if document owner merged someone else's draft
//     };
//   },
// });

// // 5. Create draft as another user (for testing/admin)
// export const createDraftForUser = mutation({
//   args: {
//     documentId: v.id("documents"),
//     userId: v.string(), // Specify which user
//     content: v.optional(v.string()),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     // Only allow document owners or admins to create drafts for others
//     const document = await ctx.db.get(args.documentId);
//     if (!document) throw new Error("Document not found");

//     if (document.ownerId !== identity.subject) {
//       throw new Error("Only document owner can create drafts for others");
//     }

//     // Check if user already has a draft
//     const existingDraft = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner_active", (q) =>
//         q.eq("ownerId", args.userId).eq("isActive", true)
//       )
//       .filter((q) => q.eq(q.field("documentId"), args.documentId))
//       .first();

//     if (existingDraft) {
//       return existingDraft._id;
//     }

//     // Create new draft
//     const now = Date.now();
//     const expiresAt = now + 24 * 60 * 60 * 1000;

//     const draftId = await ctx.db.insert("draftDocuments", {
//       documentId: args.documentId,
//       content: args.content || document.initialContent || "",
//       ownerId: args.userId,
//       roomId: `draft:${args.documentId}:${args.userId}:${now}`,
//       organizationId: document.organizationId,
//       createdAt: now,
//       expiresAt,
//       isActive: true,
//       lastUpdatedAt: now,
//     });

//     return draftId;
//   },
// });


// // convex/draft.ts - Update getOrCreateDraft function
// export const getOrCreateDraft = mutation({
//   args: {
//     documentId: v.id("documents"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const userId = identity.subject;
//     const organizationId = (identity.organization_id ?? undefined) as string | undefined;

//     // Get the original document
//     const document = await ctx.db.get(args.documentId);
//     if (!document) throw new Error("Document not found");

//     // Check for existing active draft
//     const existingDraft = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner_active", (q) =>
//         q.eq("ownerId", userId).eq("isActive", true)
//       )
//       .filter((q) => q.eq(q.field("documentId"), args.documentId))
//       .first();

//     if (existingDraft) {
//       // Update last updated time
//       await ctx.db.patch(existingDraft._id, {
//         lastUpdatedAt: Date.now(),
//       });
//       return existingDraft._id;
//     }

//     // Create new draft (expires in 24 hours)
//     const now = Date.now();
//     const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

//     // In getOrCreateDraft function, update roomId generation:
//     const draftId = await ctx.db.insert("draftDocuments", {
//       documentId: args.documentId,
//       content: document.initialContent || "",
//       ownerId: userId,
//       // Update roomId to be more unique:
//       roomId: `draft:${args.documentId}:${userId}:${now}`,
//       organizationId: organizationId || document.organizationId,
//       createdAt: now,
//       expiresAt,
//       isActive: true,
//       lastUpdatedAt: now,
//     });

//     return draftId;
//   },
// });

// // Get active draft for current user and document
// export const getActiveDraft = query({
//   args: {
//     documentId: v.id("documents"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) return null;

//     const userId = identity.subject;

//     const draft = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner_active", (q) =>
//         q.eq("ownerId", userId).eq("isActive", true)
//       )
//       .filter((q) => q.eq(q.field("documentId"), args.documentId))
//       .first();

//     return draft;
//   },
// });

// // Update draft content
// export const updateDraft = mutation({
//   args: {
//     draftId: v.id("draftDocuments"),
//     content: v.string(),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const draft = await ctx.db.get(args.draftId);
//     if (!draft) throw new Error("Draft not found");

//     // Verify ownership
//     if (draft.ownerId !== identity.subject) {
//       throw new Error("Unauthorized");
//     }

//     // Update draft content and timestamp
//     await ctx.db.patch(args.draftId, {
//       content: args.content,
//       lastUpdatedAt: Date.now(),
//     });
//   },
// });

// // Publish draft to main document
// export const publishDraft = mutation({
//   args: {
//     draftId: v.id("draftDocuments"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const draft = await ctx.db.get(args.draftId);
//     if (!draft) throw new Error("Draft not found");

//     // Verify ownership
//     if (draft.ownerId !== identity.subject) {
//       throw new Error("Unauthorized");
//     }

//     // Update main document with published content
//     await ctx.db.patch(draft.documentId, {
//       initialContent: draft.content, // Update the main content
//       publishedContent: draft.content, // Store as published version
//       lastPublishedAt: Date.now(),
//     });

//     // Archive the draft after publishing
//     await ctx.db.patch(args.draftId, {
//       isActive: false,
//     });

//     return draft.documentId;
//   },
// });

// // Discard draft (archive without publishing)
// export const discardDraft = mutation({
//   args: {
//     draftId: v.id("draftDocuments"),
//   },
//   handler: async (ctx, args) => {
//     const identity = await ctx.auth.getUserIdentity();
//     if (!identity) throw new Error("Not authenticated");

//     const draft = await ctx.db.get(args.draftId);
//     if (!draft) throw new Error("Draft not found");

//     // Verify ownership
//     if (draft.ownerId !== identity.subject) {
//       throw new Error("Unauthorized");
//     }

//     // Archive the draft
//     await ctx.db.patch(args.draftId, {
//       isActive: false,
//     });
//   },
// });

// // Clean up expired drafts (run periodically)
// export const cleanupExpiredDrafts = mutation({
//   handler: async (ctx) => {
//     const now = Date.now();
    
//     const expiredDrafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_expires", (q) => q.lt("expiresAt", now))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     for (const draft of expiredDrafts) {
//       await ctx.db.patch(draft._id, {
//         isActive: false,
//       });
//       console.log(`Draft ${draft._id} expired and archived`);
//     }

//     return { cleaned: expiredDrafts.length };
//   },
// });