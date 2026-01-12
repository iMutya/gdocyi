import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";

export const getDraftStatus = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    const userId = user.subject;
    
    const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
      ctx.db
        .query("draftDocuments")
        .withIndex("by_owner_active", (q) =>
          q.eq("ownerId", userId).eq("isActive", true)
        )
        .filter((q) => q.eq(q.field("documentId"), args.id))
        .first(),
      ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", args.id))
        .filter((q) => 
          q.and(
            q.eq(q.field("isActive"), true),
            q.neq(q.field("ownerId"), userId)
          )
        )
        .first()
    ]);

    return {
      hasUserDraft: !!userActiveDraft,
      hasOtherUserDraft: !!otherUserActiveDraft,
      isOwner: document.ownerId === userId,
      userCanEdit: document.ownerId === userId || !otherUserActiveDraft,
      userCanView: !otherUserActiveDraft || document.ownerId === userId,
    };
  },
});

export const getDocumentPublic = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.id);
    if (!document) return null;

    return {
      _id: document._id,
      ownerId: document.ownerId,
      organizationId: document.organizationId,
    };
  },
});

export const getDocumentForAuth = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    return {
      _id: document._id,
      title: document.title,
      ownerId: document.ownerId,
      organizationId: document.organizationId,
    };
  },
});


export const getDocumentRoomInfo = query({
    args: { id: v.id("documents") },
    handler: async (ctx, args) => {
        const user = await ctx.auth.getUserIdentity();
        if (!user) return null;

        const document = await ctx.db.get(args.id);
        if (!document) return null;

        const userId = user.subject;
        const organizationId = user.organization_id ?? undefined;
        
        const [userActiveDraft, otherUserActiveDrafts] = await Promise.all([
            ctx.db.query("draftDocuments")
                .withIndex("by_owner_active", (q) => q.eq("ownerId", userId).eq("isActive", true))
                .filter((q) => q.eq(q.field("documentId"), args.id))
                .first(),
            ctx.db.query("draftDocuments")
                .withIndex("by_document", (q) => q.eq("documentId", args.id))
                .filter((q) => q.and(q.eq(q.field("isActive"), true), q.neq(q.field("ownerId"), userId)))
                .collect()
        ]);

        const hasOtherUserDraft = otherUserActiveDrafts.length > 0;

        let otherEditorName = "Another user";
        if (hasOtherUserDraft) {
            otherEditorName = otherUserActiveDrafts[0].ownerName || "Another user";
        }

        return {
            roomId: document.roomId || document._id,
            isOwner: document.ownerId === userId,
            hasOtherUserDraft,
            currentUserHasDraft: !!userActiveDraft,
            otherEditorName, 
        };
    },
});


export const getByIds = query({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, { ids }) => {
    const documentPromises = ids.map(id => ctx.db.get(id));
    const documents = await Promise.all(documentPromises);

    return documents.map((document, index) => {
      if (document) {
        return { id: document._id, name: document.title };
      } else {
        return { id: ids[index], name: "[Removed]" };
      }
    });
  },
});


export const create = mutation({
  args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
  handler: async(ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const organizationId = (user.organization_id ?? undefined) as string | undefined;

    return await ctx.db.insert("documents", {
      title: args.title ?? "Untitled Document",
      ownerId: user.subject,
      organizationId,
      initialContent: args.initialContent || "",
    });
  },
});


export const get = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, { search, paginationOpts }) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const userId = user.subject;

    const getDocumentsWithOtherDrafts = async (docIds: Id<"documents">[]) => {
      if (docIds.length === 0) return new Set<string>();
      
      const otherDrafts = await ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", docIds[0]))
        .filter((q) => 
          q.and(
            q.eq(q.field("isActive"), true),
            q.neq(q.field("ownerId"), userId)
          )
        )
        .collect();
      
      return new Set(otherDrafts.map(d => d.documentId));
    };

    let result;
    if (search && organizationId) {
      result = await ctx.db
        .query("documents")
        .withSearchIndex("search_title", (q) =>
          q.search("title", search).eq("organizationId", organizationId)
        )
        .paginate(paginationOpts);
    } else if (search) {
      result = await ctx.db
        .query("documents")
        .withSearchIndex("search_title", (q) => 
          q.search("title", search).eq("ownerId", userId)
        )
        .paginate(paginationOpts);
    } else if (organizationId) {
      result = await ctx.db
        .query("documents")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
        .paginate(paginationOpts);
    } else {
      result = await ctx.db
        .query("documents")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", userId))
        .paginate(paginationOpts);
    }

    if (organizationId && result.page.length > 0) {
      const docIds = result.page.map(doc => doc._id);
      const docsWithOtherDrafts = await getDocumentsWithOtherDrafts(docIds);
      
      const filteredPage = result.page.filter(doc => 
        !docsWithOtherDrafts.has(doc._id) || doc.ownerId === userId
      );
      
      return {
        ...result,
        page: filteredPage,
      };
    }

    return result;
  },
});


export const removeById = mutation({
  args: { id: v.id("documents") },
  handler: async(ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const document = await ctx.db.get(args.id);

    if (!document) throw new ConvexError("Document Not Found!");
    
    const isOwner = document.ownerId === user.subject;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if (!isOwner && !isOrganizationMember) {
      throw new ConvexError("Unauthorized");
    }

    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const deletePromises = activeDrafts.map(draft => ctx.db.delete(draft._id));
    await Promise.all(deletePromises);

    return await ctx.db.delete(args.id);
  },
});


export const updateById = mutation({
  args: { id: v.id("documents"), title: v.string() },
  handler: async(ctx, args) => { 
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const document = await ctx.db.get(args.id);

    if (!document) throw new ConvexError("Document Not Found!");
    
    const isOwner = document.ownerId === user.subject;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if (!isOwner && !isOrganizationMember) {
      throw new ConvexError("Unauthorized");
    }

    if (document.title !== args.title) {
      await ctx.db.patch(args.id, { title: args.title });
      return { updated: true };
    }
    
    return { unchanged: true };
  },
});


export const getById = query({
  args: { id: v.id("documents") },
  handler: async (ctx, { id }) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const document = await ctx.db.get(id);
    if (!document) throw new ConvexError("Document not found");

    const userId = user.subject;
    
    if (document.ownerId !== userId) {
      const anyActiveDraft = await ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();
      
      if (anyActiveDraft) {
        return {
          _id: document._id,
          title: document.title,
          ownerId: document.ownerId,
          organizationId: document.organizationId,
          initialContent: document.publishedContent || document.initialContent || "",
          _draftBlocked: true,
          publishedContent: document.publishedContent || "",
        };
      }
    }

    return {
      ... document,
      publishedContent: document.publishedContent || "",
    };
  },
});


export const getWithDraft = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const [document, draftChecks] = await Promise.all([
      ctx.db.get(args.id),
      (async () => {
        const userId = user.subject;
        
        const [otherUserDraft, userDraft] = await Promise.all([
          ctx.db
            .query("draftDocuments")
            .withIndex("by_document", (q) => q.eq("documentId", args.id))
            .filter((q) => 
              q.and(
                q.eq(q.field("isActive"), true),
                q.eq(q.field("ownerId"), userId)
              )
            )
            .first(),
          ctx.db
            .query("draftDocuments")
            .withIndex("by_owner_active", (q) =>
              q.eq("ownerId", userId).eq("isActive", true)
            )
            .filter((q) => q.eq(q.field("documentId"), args.id))
            .first()
        ]);
        
        return { otherUserDraft, userDraft, userId };
      })()
    ]);

    if (!document) throw new ConvexError("Document not found");

    const { otherUserDraft, userDraft, userId } = draftChecks;

    if (document.ownerId !== userId && !otherUserDraft) {
      return {
        ...document,
        hasActiveDraft: false,
        activeDraftId: null,
        draftContent: null,
        draftExpiresAt: null,
        isInDraftMode: false,
        initialContent: document.publishedContent || document.initialContent || "",
      };
    }

    return {
      ...document,
      hasActiveDraft: !!userDraft,
      activeDraftId: userDraft?._id,
      draftContent: userDraft?.content,
      draftExpiresAt: userDraft?.expiresAt,
      isInDraftMode: !!userDraft,
      publishedContent: document.publishedContent || "",
    };
  },
});


export const updateContent = mutation({
  args: {
    id: v.id("documents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const document = await ctx.db.get(args.id);
    if (!document) throw new ConvexError("Document not found");

    const isOwner = document.ownerId === user.subject;
    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if (!isOwner && !isOrganizationMember) {
      throw new ConvexError("Unauthorized");
    }

    const activeDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", user.subject).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .first();

    if (activeDraft) {
      throw new ConvexError(
        "Cannot update document while in draft mode. Publish or discard draft first."
      );
    }

    if (document.initialContent !== args.content) {
      await ctx.db.patch(args.id, {
        initialContent: args.content,
      });
    }

    return { updated: true };
  },
});


export const publishContent = mutation({
  args: {
    id: v.id("documents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const document = await ctx.db.get(args.id);
    if (!document) throw new ConvexError("Document not found");

    await ctx.db.patch(args.id, {
      publishedContent: args.content,
      lastPublishedAt: Date.now(),
    });

    return { published: true };
  },
});

export const cleanupUserDrafts = mutation({
  args: {
    userId: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const updatePromises = activeDrafts.map(draft =>
      ctx.db.patch(draft._id, { isActive: false })
    );

    await Promise.all(updatePromises);

    return { archivedDrafts: activeDrafts.length };
  },
});



