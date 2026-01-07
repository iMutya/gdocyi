import { ConvexError, v } from "convex/values";
import { mutation, query, action } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { api } from "./_generated/api";

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

    // search inside the organization
    if(search && organizationId){
      return await ctx.db
      .query("documents")
      .withSearchIndex("search_title", (q) =>
        q.search("title", search).eq("organizationId", organizationId)
      )
      .paginate(paginationOpts)
    }

    // search inside the personal
    if(search){
      return await ctx.db
      .query("documents")
      .withSearchIndex("search_title", (q) => 
        q.search("title", search).eq("ownerId", user.subject)
      )
      .paginate(paginationOpts)
    }

    // all docs inside the organization
    if(organizationId){
      return await ctx.db
      .query("documents")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
      .paginate(paginationOpts);
    }

    // docs inside the personal
    return await ctx.db
    .query("documents")
    .withIndex("by_owner_id", (q) => q.eq("ownerId", user.subject))
    .paginate(paginationOpts);
  },
});

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
    const document = await ctx.db.get(id);

    if(!document){
      throw new ConvexError("Document not found");
    }

    return document;
  },
});

// NEW: Get document with draft status
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

    // Check if user has an active draft for this document
    const activeDraft = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner_active", (q) =>
        q.eq("ownerId", user.subject).eq("isActive", true)
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
      .filter((q: any) => q.eq(q.field("isActive"), true)) // Add :any to fix type
      .collect();

    for (const draft of activeDrafts) {
      await ctx.db.patch(draft._id, {
        isActive: false,
      });
    }

    return { archivedDrafts: activeDrafts.length };
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