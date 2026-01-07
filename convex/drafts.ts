// convex/draft.ts
import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { api } from "./_generated/api";

// Get or create a draft for a document
export const getOrCreateDraft = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    // Get the original document
    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    // Check for existing active draft
    const existingDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.documentId))
      .first();

    if (existingDraft) {
      // Update last updated time
      await ctx.db.patch(existingDraft._id, {
        lastUpdatedAt: Date.now(),
      });
      return existingDraft._id;
    }

    // Create new draft (expires in 24 hours)
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    const draftId = await ctx.db.insert("draftDocuments", {
      documentId: args.documentId,
      content: document.initialContent || "",
      ownerId: userId,
      roomId: document.roomId, // Copy roomId for Liveblocks
      createdAt: now,
      expiresAt,
      isActive: true,
      lastUpdatedAt: now,
    });

    return draftId;
  },
});

// Get active draft for current user and document
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

    return draft;
  },
});

// Update draft content
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

    // Verify ownership
    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Update draft content and timestamp
    await ctx.db.patch(args.draftId, {
      content: args.content,
      lastUpdatedAt: Date.now(),
    });
  },
});

// Publish draft to main document
export const publishDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    // Verify ownership
    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Update main document with published content
    await ctx.db.patch(draft.documentId, {
      initialContent: draft.content, // Update the main content
      publishedContent: draft.content, // Store as published version
      lastPublishedAt: Date.now(),
    });

    // Archive the draft after publishing
    await ctx.db.patch(args.draftId, {
      isActive: false,
    });

    return draft.documentId;
  },
});

// Discard draft (archive without publishing)
export const discardDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const draft = await ctx.db.get(args.draftId);
    if (!draft) throw new Error("Draft not found");

    // Verify ownership
    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    // Archive the draft
    await ctx.db.patch(args.draftId, {
      isActive: false,
    });
  },
});

// Clean up expired drafts (run periodically)
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
      console.log(`Draft ${draft._id} expired and archived`);
    }

    return { cleaned: expiredDrafts.length };
  },
});