import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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

    return drafts; 
    
  },
});

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

    return drafts;
  },
});

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


    return {
      draftContent: draft.content, 
      mainContent: document.initialContent || "",
      draftOwnerId: draft.ownerId,
      draftCreatedAt: draft.createdAt,
      lastUpdatedAt: draft.lastUpdatedAt,
    };
  },
});

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

    const targetOwnerName = "Collaborator";
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    const draftId = await ctx.db.insert("draftDocuments", {
      documentId: args.documentId,
      content: args.content || document.initialContent || "",
      ownerId: args.userId,
      ownerName: targetOwnerName,
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

export const getOrCreateDraft = mutation({
  args: {
    documentId: v.id("documents"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;
    const organizationId = (identity.organization_id ?? undefined) as string | undefined;

    const rawName = identity.name || identity.nickname || identity.given_name || "Guest Editor";
    const ownerName = String(rawName); 

    const document = await ctx.db.get(args.documentId);
    if (!document) throw new Error("Document not found");

    const draftId = await ctx.db.insert("draftDocuments", {
      documentId: args.documentId,
      content: document.initialContent || "",
      ownerId: userId,
      ownerName: ownerName, 
      roomId: `draft:${args.documentId}:${userId}:${Date.now()}`,
      organizationId: organizationId || document.organizationId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      isActive: true,
      lastUpdatedAt: Date.now(),
    });

    return draftId;
  },
});


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

    if (draft.content === args.content) {
      return { updated: false, reason: "identical content" };
    }

    await ctx.db.patch(args.draftId, {
      content: args.content,
      lastUpdatedAt: Date.now(),
    });

    return { updated: true, draftId: args.draftId };
  },
});


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

    await ctx.db.patch(draft.documentId, {
      publishedContent: draft.content, 
      lastPublishedAt: Date.now(),
    });

    await ctx.db.patch(args.draftId, {
      isActive: false,
    });

    return draft.documentId;
  },
});

export const discardDraft = mutation({
  args: {
    draftId: v.id("draftDocuments"),
  },
  handler: async (ctx, args) => {
    
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    
    const draft = await ctx.db.get(args.draftId);
    if (!draft) {
      throw new Error("Draft not found");
    }

    
    if (draft.ownerId !== identity.subject) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.draftId);
    
    return { deleted: true };
  },
});

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




