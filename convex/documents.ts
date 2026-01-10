import { ConvexError, v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Add this to check if a document is in draft mode for current user
export const getDraftStatus = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    const userId = user.subject;
    
    // Check if current user has an active draft
    const userActiveDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .first();

    // Check if ANY other user has an active draft
    const otherUserActiveDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .filter((q) => 
        q.and(
          q.eq(q.field("isActive"), true),
          q.neq(q.field("ownerId"), userId)
        )
      )
      .first();

    return {
      hasUserDraft: !!userActiveDraft,
      hasOtherUserDraft: !!otherUserActiveDraft,
      isOwner: document.ownerId === userId,
      userCanEdit: document.ownerId === userId || !otherUserActiveDraft,
      userCanView: !otherUserActiveDraft || document.ownerId === userId,
    };
  },
});

// Add this PUBLIC query (no auth checks for document existence)
export const getDocumentPublic = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    // NO auth check - just get the document
    const document = await ctx.db.get(args.id);
    
    if (!document) {
      return null;
    }

    // Return minimal info for LiveBlocks auth
    return {
      _id: document._id,
      ownerId: document.ownerId,
      organizationId: document.organizationId,
      // Add other fields you need for auth
    };
  },
});

// Add this simple query for LiveBlocks auth
export const getDocumentForAuth = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    // Return minimal document info for auth
    return {
      _id: document._id,
      title: document.title,
      ownerId: document.ownerId,
      organizationId: document.organizationId,
    };
  },
});

// Add this function to check if document should have LiveBlocks enabled
export const getDocumentRoomInfo = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    const userId = user.subject;
    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    
    // Check if current user has an active draft
    const userActiveDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .first();

    // Check if ANY other user has an active draft
    const otherUserActiveDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .filter((q) => 
        q.and(
          q.eq(q.field("isActive"), true),
          q.neq(q.field("ownerId"), userId),
          organizationId ? q.eq(q.field("organizationId"), organizationId) : q.eq(q.field("organizationId"), undefined)
        )
      )
      .first();

    // Determine if LiveBlocks should be enabled
    // Enable LiveBlocks if:
    // 1. User doesn't have an active draft AND
    // 2. No other user has an active draft
    const shouldEnableLiveBlocks = !userActiveDraft && !otherUserActiveDraft;

    return {
      roomId: document.roomId || document._id,
      shouldEnableLiveBlocks,
      isOwner: document.ownerId === userId,
      documentId: document._id,
      hasUserDraft: !!userActiveDraft,
      hasOtherUserDraft: !!otherUserActiveDraft,
    };
  },
});



export const getByIds = query ({
  args: {ids: v.array(v.id("documents")) },
  handler: async (ctx, {ids}) => {
    const documents = [];

    for (const id of ids){
      const document = await ctx.db.get(id);

      if(document){
        documents.push({id: document._id, name: document.title})
      } else {
        documents.push({id, name:"[Removed]"})
      }
    }

    return documents;
  },
});

export const create = mutation ({
  args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
  handler: async(ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if(!user){
      throw new ConvexError("Unauthorized");
    }

    const organizationId = (user.organization_id ?? undefined) as
      | string
      | undefined;

    return await ctx.db.insert("documents", {
      title: args.title ?? "Untitled Document",
      ownerId: user.subject,
      organizationId,
      initialContent: args.initialContent || "",
    });

  },
});

// Replace the existing 'get' query function with this one:
export const get = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, {search, paginationOpts}) => {
    const user = await ctx.auth.getUserIdentity();

    if(!user) {
      throw new ConvexError("Unauthorized");
    }

    const organizationId = (user.organization_id ?? undefined) as
      | string
      | undefined;
    const userId = user.subject;

    // NEW: Function to check if a document has active drafts by other users
    const hasOtherUserActiveDraft = async (documentId: Id<"documents">) => {
      const otherUserDraft = await ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", documentId))
        .filter((q) => 
          q.and(
            q.eq(q.field("isActive"), true),
            q.neq(q.field("ownerId"), userId)
          )
        )
        .first();
      
      return !!otherUserDraft;
    };

    // SEARCH inside organization
    if(search && organizationId){
      const result = await ctx.db
        .query("documents")
        .withSearchIndex("search_title", (q) =>
          q.search("title", search).eq("organizationId", organizationId)
        )
        .paginate(paginationOpts);
      
      // Filter out documents with other users' drafts
      const filteredPage = [];
      for (const doc of result.page) {
        const hasOtherDraft = await hasOtherUserActiveDraft(doc._id);
        if (!hasOtherDraft || doc.ownerId === userId) {
          filteredPage.push(doc);
        }
      }
      
      return {
        ...result,
        page: filteredPage,
      };
    }

    // SEARCH inside personal
    if(search){
      const result = await ctx.db
        .query("documents")
        .withSearchIndex("search_title", (q) => 
          q.search("title", search).eq("ownerId", userId)
        )
        .paginate(paginationOpts);
      
      return result; // Personal docs always show to owner
    }

    // ALL docs inside organization
    if(organizationId){
      const result = await ctx.db
        .query("documents")
        .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
        .paginate(paginationOpts);
      
      // Filter out documents with other users' drafts
      const filteredPage = [];
      for (const doc of result.page) {
        const hasOtherDraft = await hasOtherUserActiveDraft(doc._id);
        if (!hasOtherDraft || doc.ownerId === userId) {
          filteredPage.push(doc);
        }
      }
      
      return {
        ...result,
        page: filteredPage,
      };
    }

    // docs inside personal
    return await ctx.db
      .query("documents")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", userId))
      .paginate(paginationOpts);
  },
});
//en

export const removeById = mutation({
  args: {id: v.id("documents")},
  handler: async(ctx, args) => {
    const user = await ctx.auth.getUserIdentity();

    if(!user){
      throw new ConvexError("Unauthorized");
    }

    const organizationId = (user.organization_id ?? undefined) as
      | string
      | undefined;

    const document = await ctx.db.get(args.id);

    if(!document){
      throw new ConvexError("Document Not Found!");
    }

    const isOwner = document.ownerId === user.subject;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if(!isOwner && !isOrganizationMember){
      throw new ConvexError("Unauthorized");
    }

    // Also delete any active drafts for this document
    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const draft of activeDrafts) {
      await ctx.db.delete(draft._id);
    }

    return await ctx.db.delete(args.id);
  },
});

export const updateById = mutation({
  args: {id: v.id("documents"), title: v.string()},
  handler: async(ctx, args) => { 
    const user = await ctx.auth.getUserIdentity();

    if(!user){
      throw new ConvexError("Unauthorized");
    }

    const organizationId = (user.organization_id ?? undefined) as
      | string
      | undefined;

    const document = await ctx.db.get(args.id);

    if(!document){
      throw new ConvexError("Document Not Found!");
    }

    const isOwner = document.ownerId === user.subject;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if(!isOwner && !isOrganizationMember){
      throw new ConvexError("Unauthorized");
    }

    return await ctx.db.patch(args.id, {title: args.title});
  },
});

export const getById = query({
  args:{ id: v.id("documents")},
  handler: async (ctx, { id }) => {
    const user = await ctx.auth.getUserIdentity();
    
    if(!user){
      throw new ConvexError("Unauthorized");
    }

    const document = await ctx.db.get(id);

    if(!document){
      throw new ConvexError("Document not found");
    }

    const userId = user.subject;
    
    // If user is not the owner, check if they should see published content only
    if (document.ownerId !== userId) {
      // Check if any user has an active draft for this document
      const anyActiveDraft = await ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();
      
      // If there's an active draft, non-owners should get published content
      if (anyActiveDraft) {
        return {
          ...document,
          // Return published content instead of draft content
          initialContent: document.publishedContent || document.initialContent || "",
          _draftBlocked: true, // Flag that draft is hidden
        };
      }
    }

    return document;
  },
});
//en
export const getWithDraft = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }

    const document = await ctx.db.get(args.id);
    
    if (!document) {
      throw new ConvexError("Document not found");
    }

    const userId = user.subject;
    
    // CHECK: Is user the owner?
    if (document.ownerId !== userId) {
      // Non-owner trying to access - check if they have draft access
      const otherUserActiveDraft = await ctx.db
        .query("draftDocuments")
        .withIndex("by_document", (q) => q.eq("documentId", args.id))
        .filter((q) => 
          q.and(
            q.eq(q.field("isActive"), true),
            q.eq(q.field("ownerId"), userId) // This user's draft
          )
        )
        .first();
      
      // If user doesn't have their own draft, they can't see draft content
      if (!otherUserActiveDraft) {
        // Return only published content for non-owners
        return {
          ...document,
          hasActiveDraft: false,
          activeDraftId: null,
          draftContent: null, // HIDE draft content
          draftExpiresAt: null,
          isInDraftMode: false,
          // Show published content instead of initial content
          initialContent: document.publishedContent || document.initialContent || "",
        };
      }
    }

    // Owner or user with their own draft can see everything
    const activeDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", userId).eq("isActive", true)
      )
      .filter((q) => q.eq(q.field("documentId"), args.id))
      .first();

    return {
      ...document,
      hasActiveDraft: !!activeDraft,
      activeDraftId: activeDraft?._id,
      draftContent: activeDraft?.content,
      draftExpiresAt: activeDraft?.expiresAt,
      isInDraftMode: !!activeDraft,
    };
  },
});

// NEW: Update document content (for regular edits when not in draft mode)
export const updateContent = mutation({
  args: {
    id: v.id("documents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new ConvexError("Document not found");
    }

    const isOwner = document.ownerId === user.subject;
    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const isOrganizationMember = 
      !!(document.organizationId && document.organizationId === organizationId);

    if (!isOwner && !isOrganizationMember) {
      throw new ConvexError("Unauthorized");
    }

    // Check if user has an active draft
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

    // Update main document
    await ctx.db.patch(args.id, {
      initialContent: args.content,
    });
  },
});

// NEW: Publish content from draft (used by draft.publishDraft)
export const publishContent = mutation({
  args: {
    id: v.id("documents"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) {
      throw new ConvexError("Unauthorized");
    }

    const document = await ctx.db.get(args.id);
    if (!document) {
      throw new ConvexError("Document not found");
    }

    // Update main document with published content
    await ctx.db.patch(args.id, {
      initialContent: args.content,
      publishedContent: args.content, // Store as published version
      lastPublishedAt: Date.now(),
    });
  },
});

// NEW: Clean up drafts when user leaves organization
// NEW: Clean up drafts when user leaves organization
// FIXED: Changed from action to mutation
export const cleanupUserDrafts = mutation({
  args: {
    userId: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Archive all active drafts for this user
    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .collect();

    // Filter in JavaScript for isActive
    const filteredDrafts = activeDrafts.filter(draft => draft.isActive);

    for (const draft of filteredDrafts) {
      await ctx.db.patch(draft._id, {
        isActive: false,
      });
    }

    return { archivedDrafts: filteredDrafts.length };
  },
});











// import { ConvexError, v } from "convex/values";
// import { mutation, query } from "./_generated/server";
// import { paginationOptsValidator } from "convex/server";

// export const getByIds = query ({
//   args: {ids: v.array(v.id("documents")) },
//   handler: async (ctx, {ids}) => {
//     const documents = [];

//     for (const id of ids){
//       const document = await ctx.db.get(id);

//       if(document){
//         documents.push({id: document._id, name: document.title})
//       } else {
//         documents.push({id, name:"[Removed]"})
//       }
//     }

//     return documents;
//   },
// });

// export const create = mutation ({
//   args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();

//     if(!user){
//       throw new ConvexError("Unauthorized");
//     }

//     const organizationId = (user.organization_id ?? undefined) as
//       | string
//       | undefined;

//     return await ctx.db.insert("documents", {
//       title: args.title ?? "Untitled Document",
//       ownerId: user.subject,
//       organizationId,
//       initialContent: args.initialContent,
//     })

//   },
// });

// export const get = query({
//   args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
//   handler: async (ctx, {search, paginationOpts}) => {
//     const user = await ctx.auth.getUserIdentity();

//     if(!user) {
//       throw new ConvexError("Unauthorized");
//     }

//     const organizationId = (user.organization_id ?? undefined) as
//       | string
//       | undefined;

//     // search inside the organization
//     if(search && organizationId){
//       return await ctx.db
//       .query("documents")
//       .withSearchIndex("search_title", (q) =>
//         q.search("title", search).eq("organizationId", organizationId)
//       )
//       .paginate(paginationOpts)
//     }

//     // search inside the personal
//     if(search){
//       return await ctx.db
//       .query("documents")
//       .withSearchIndex("search_title", (q) => 
//         q.search("title", search).eq("ownerId", user.subject)
//       )
//       .paginate(paginationOpts)
//     }

//     // all docs inside the organization
//     if(organizationId){
//       return await ctx.db
//       .query("documents")
//       .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
//       .paginate(paginationOpts);
//     }

//     // docs inside the personal
//     return await ctx.db
//     .query("documents")
//     .withIndex("by_owner_id", (q) => q.eq("ownerId", user.subject))
//     .paginate(paginationOpts);
//   },
// });

// export const removeById = mutation({
//   args: {id: v.id("documents")},
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();

//     if(!user){
//       throw new ConvexError("Unauthorized");
//     }

//     const organizationId = (user.organization_id ?? undefined) as
//       | string
//       | undefined;

//     const document = await ctx.db.get(args.id);

//     if(!document){
//       throw new ConvexError("Document Not Found!");
//     }

//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if(!isOwner && !isOrganizationMember){
//       throw new ConvexError("Unauthorized");
//     }

//     return await ctx.db.delete(args.id);
//   },
// });

// export const updateById = mutation({
//   args: {id: v.id("documents"), title: v.string()},
//   handler: async(ctx, args) => { 
//     const user = await ctx.auth.getUserIdentity();

//     if(!user){
//       throw new ConvexError("Unauthorized");
//     }

//     const organizationId = (user.organization_id ?? undefined) as
//       | string
//       | undefined;

//     const document = await ctx.db.get(args.id);

//     if(!document){
//       throw new ConvexError("Document Not Found!");
//     }

//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if(!isOwner && !isOrganizationMember){
//       throw new ConvexError("Unauthorized");
//     }

//     return await ctx.db.patch(args.id, {title: args.title});
//   },
// });

// export const getById = query({
//   args:{ id: v.id("documents")},
//   handler: async (ctx, { id }) => {
//     const document = await ctx.db.get(id);

//     if(!document){
//       throw new ConvexError("Document not found");
//     }

//     return document;
//   },
// });