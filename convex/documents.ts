import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";

// 1. Get draft status - OPTIMIZED: Parallel queries
export const getDraftStatus = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) return null;

    const document = await ctx.db.get(args.id);
    if (!document) return null;

    const userId = user.subject;
    
    // OPTIMIZATION: Run both draft checks in parallel
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

// 2. Public document query - OPTIMIZED: Already minimal
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

// 3. Document for auth - OPTIMIZED: Already minimal
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


// 4. Document room info - FIXED: Now includes draft lock info
export const getDocumentRoomInfo = query({
    args: { id: v.id("documents") },
    handler: async (ctx, args) => {
        const user = await ctx.auth.getUserIdentity();
        if (!user) return null;

        const document = await ctx.db.get(args.id);
        if (!document) return null;

        const userId = user.subject;
        const organizationId = (user.organization_id ?? undefined) as string | undefined;
        
        // ✅ FIXED: Run queries in parallel AND get both draft statuses
        const [userActiveDraft, otherUserActiveDrafts] = await Promise.all([
            // User's active draft
            ctx.db
                .query("draftDocuments")
                .withIndex("by_owner_active", (q) =>
                    q.eq("ownerId", userId).eq("isActive", true)
                )
                .filter((q) => q.eq(q.field("documentId"), args.id))
                .first(),
            // Other users' active drafts
            organizationId 
                ? ctx.db
                    .query("draftDocuments")
                    .withIndex("by_document", (q) => q.eq("documentId", args.id))
                    .filter((q) => 
                        q.and(
                            q.eq(q.field("isActive"), true),
                            q.neq(q.field("ownerId"), userId),
                            q.eq(q.field("organizationId"), organizationId)
                        )
                    )
                    .collect()
                : ctx.db
                    .query("draftDocuments")
                    .withIndex("by_document", (q) => q.eq("documentId", args.id))
                    .filter((q) => 
                        q.and(
                            q.eq(q.field("isActive"), true),
                            q.neq(q.field("ownerId"), userId),
                            q.eq(q.field("organizationId"), undefined)
                        )
                    )
                    .collect()
        ]);

        const hasOtherUserDraft = otherUserActiveDrafts.length > 0;
        const shouldEnableLiveBlocks = !userActiveDraft && !hasOtherUserDraft;

        // ✅ FIXED: Return ALL necessary fields for editor lock
        return {
            // Room info
            roomId: document.roomId || document._id,
            shouldEnableLiveBlocks,
            isOwner: document.ownerId === userId,
            
            // ✅ CRITICAL: Add these draft lock fields
            hasOtherUserDraft: hasOtherUserDraft,
            currentUserHasDraft: !!userActiveDraft,
            otherDraftCount: otherUserActiveDrafts.length,
            
            // Optional debug info
            currentUserId: userId,
            documentOwnerId: document.ownerId,
            totalDrafts: (userActiveDraft ? 1 : 0) + otherUserActiveDrafts.length
        };
    },
});
// // 4. Document room info - CRITICAL OPTIMIZATION (6.82 KB)
// export const getDocumentRoomInfo = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     const userId = user.subject;
//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
    
//     // OPTIMIZATION: Run queries in parallel
//     const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
//       // User's active draft
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_owner_active", (q) =>
//           q.eq("ownerId", userId).eq("isActive", true)
//         )
//         .filter((q) => q.eq(q.field("documentId"), args.id))
//         .first(),
//       // Other user's active draft
//       organizationId 
//         ? ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), organizationId)
//               )
//             )
//             .first()
//         : ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), undefined)
//               )
//             )
//             .first()
//     ]);

//     const shouldEnableLiveBlocks = !userActiveDraft && !otherUserActiveDraft;

//     // OPTIMIZATION: Remove redundant fields to reduce bandwidth
//     return {
//       roomId: document.roomId || document._id,
//       shouldEnableLiveBlocks,
//       isOwner: document.ownerId === userId,
//       // Removed: documentId (same as args.id), hasUserDraft, hasOtherUserDraft
//     };
//   },
// });

// 5. Get by IDs - OPTIMIZED: Use Promise.all for parallel gets
export const getByIds = query({
  args: { ids: v.array(v.id("documents")) },
  handler: async (ctx, { ids }) => {
    // OPTIMIZATION: Get all documents in parallel
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

// 6. Create document - No optimization needed
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

// 7. Get documents with search - OPTIMIZED: Reduce N+1 queries
export const get = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  handler: async (ctx, { search, paginationOpts }) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    const organizationId = (user.organization_id ?? undefined) as string | undefined;
    const userId = user.subject;

    // OPTIMIZATION: Pre-compute which documents have other user drafts
    const getDocumentsWithOtherDrafts = async (docIds: Id<"documents">[]) => {
      if (docIds.length === 0) return new Set<string>();
      
      // Get all drafts for these documents in one query
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
      
      // For multiple documents, we need to filter in JavaScript
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

    // OPTIMIZATION: Only check drafts for organization results
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

// 8. Remove by ID - OPTIMIZED: Batch delete operations
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

    // OPTIMIZATION: Get all drafts first
    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_document", (q) => q.eq("documentId", args.id))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // OPTIMIZATION: Delete drafts in parallel
    const deletePromises = activeDrafts.map(draft => ctx.db.delete(draft._id));
    await Promise.all(deletePromises);

    return await ctx.db.delete(args.id);
  },
});

// 9. Update by ID - OPTIMIZED: Skip update if title unchanged
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

    // OPTIMIZATION: Only update if title actually changed
    if (document.title !== args.title) {
      await ctx.db.patch(args.id, { title: args.title });
      return { updated: true };
    }
    
    return { unchanged: true };
  },
});

// 10. Get by ID - OPTIMIZED: Reduce data for non-owners
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
        // OPTIMIZATION: Return minimal data for non-owners with active drafts
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

// 11. Get with draft - CRITICAL OPTIMIZATION (4.13 KB)
export const getWithDraft = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Unauthorized");

    // OPTIMIZATION: Get document and draft in parallel
    const [document, draftChecks] = await Promise.all([
      ctx.db.get(args.id),
      // Check for drafts in parallel
      (async () => {
        const userId = user.subject;
        
        const [otherUserDraft, userDraft] = await Promise.all([
          // Check if user has access to this draft
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
          // Get user's active draft
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
      // Non-owner without draft access
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

// 12. Update content - CRITICAL OPTIMIZATION (4.56 KB)
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

    // OPTIMIZATION: Check for active draft
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

    // OPTIMIZATION: Only update if content changed
    if (document.initialContent !== args.content) {
      await ctx.db.patch(args.id, {
        initialContent: args.content,
      });
    }

    // OPTIMIZATION: Return minimal response
    return { updated: true };
  },
});

// 13. Publish content - OPTIMIZED: Minimal response
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
      // initialContent: args.content,
      publishedContent: args.content,
      lastPublishedAt: Date.now(),
    });

    return { published: true };
  },
});

// 14. Cleanup user drafts - OPTIMIZED: Use better filtering
export const cleanupUserDrafts = mutation({
  args: {
    userId: v.string(),
    organizationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get active drafts for this user
    const activeDrafts = await ctx.db
      .query("draftDocuments")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    // OPTIMIZATION: Update in parallel
    const updatePromises = activeDrafts.map(draft =>
      ctx.db.patch(draft._id, { isActive: false })
    );

    await Promise.all(updatePromises);

    return { archivedDrafts: activeDrafts.length };
  },
});





// import { ConvexError, v } from "convex/values";
// import { mutation, query } from "./_generated/server";
// import { paginationOptsValidator } from "convex/server";
// import { Id } from "./_generated/dataModel";

// // 1. Get draft status - OPTIMIZED: Parallel queries
// export const getDraftStatus = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     const userId = user.subject;
    
//     // OPTIMIZATION: Run both draft checks in parallel
//     const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_owner_active", (q) =>
//           q.eq("ownerId", userId).eq("isActive", true)
//         )
//         .filter((q) => q.eq(q.field("documentId"), args.id))
//         .first(),
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", args.id))
//         .filter((q) => 
//           q.and(
//             q.eq(q.field("isActive"), true),
//             q.neq(q.field("ownerId"), userId)
//           )
//         )
//         .first()
//     ]);

//     return {
//       hasUserDraft: !!userActiveDraft,
//       hasOtherUserDraft: !!otherUserActiveDraft,
//       isOwner: document.ownerId === userId,
//       userCanEdit: document.ownerId === userId || !otherUserActiveDraft,
//       userCanView: !otherUserActiveDraft || document.ownerId === userId,
//     };
//   },
// });

// // 2. Public document query - OPTIMIZED: Already minimal
// export const getDocumentPublic = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     return {
//       _id: document._id,
//       ownerId: document.ownerId,
//       organizationId: document.organizationId,
//     };
//   },
// });

// // 3. Document for auth - OPTIMIZED: Already minimal
// export const getDocumentForAuth = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     return {
//       _id: document._id,
//       title: document.title,
//       ownerId: document.ownerId,
//       organizationId: document.organizationId,
//     };
//   },
// });

// // 4. Document room info - CRITICAL OPTIMIZATION (6.82 KB)
// export const getDocumentRoomInfo = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     const userId = user.subject;
//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
    
//     // OPTIMIZATION: Run queries in parallel
//     const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
//       // User's active draft
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_owner_active", (q) =>
//           q.eq("ownerId", userId).eq("isActive", true)
//         )
//         .filter((q) => q.eq(q.field("documentId"), args.id))
//         .first(),
//       // Other user's active draft
//       organizationId 
//         ? ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), organizationId)
//               )
//             )
//             .first()
//         : ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), undefined)
//               )
//             )
//             .first()
//     ]);

//     const shouldEnableLiveBlocks = !userActiveDraft && !otherUserActiveDraft;

//     // OPTIMIZATION: Remove redundant fields to reduce bandwidth
//     return {
//       roomId: document.roomId || document._id,
//       shouldEnableLiveBlocks,
//       isOwner: document.ownerId === userId,
//       // Removed: documentId (same as args.id), hasUserDraft, hasOtherUserDraft
//     };
//   },
// });

// // 5. Get by IDs - OPTIMIZED: Use Promise.all for parallel gets
// export const getByIds = query({
//   args: { ids: v.array(v.id("documents")) },
//   handler: async (ctx, { ids }) => {
//     // OPTIMIZATION: Get all documents in parallel
//     const documentPromises = ids.map(id => ctx.db.get(id));
//     const documents = await Promise.all(documentPromises);

//     return documents.map((document, index) => {
//       if (document) {
//         return { id: document._id, name: document.title };
//       } else {
//         return { id: ids[index], name: "[Removed]" };
//       }
//     });
//   },
// });

// // 6. Create document - No optimization needed
// export const create = mutation({
//   args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;

//     return await ctx.db.insert("documents", {
//       title: args.title ?? "Untitled Document",
//       ownerId: user.subject,
//       organizationId,
//       initialContent: args.initialContent || "",
//     });
//   },
// });

// // 7. Get documents with search - OPTIMIZED: Reduce N+1 queries
// export const get = query({
//   args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
//   handler: async (ctx, { search, paginationOpts }) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const userId = user.subject;

//     // OPTIMIZATION: Pre-compute which documents have other user drafts
//     const getDocumentsWithOtherDrafts = async (docIds: Id<"documents">[]) => {
//       if (docIds.length === 0) return new Set<string>();
      
//       // Get all drafts for these documents in one query
//       const otherDrafts = await ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", docIds[0]))
//         .filter((q) => 
//           q.and(
//             q.eq(q.field("isActive"), true),
//             q.neq(q.field("ownerId"), userId)
//           )
//         )
//         .collect();
      
//       // For multiple documents, we need to filter in JavaScript
//       return new Set(otherDrafts.map(d => d.documentId));
//     };

//     let result;
//     if (search && organizationId) {
//       result = await ctx.db
//         .query("documents")
//         .withSearchIndex("search_title", (q) =>
//           q.search("title", search).eq("organizationId", organizationId)
//         )
//         .paginate(paginationOpts);
//     } else if (search) {
//       result = await ctx.db
//         .query("documents")
//         .withSearchIndex("search_title", (q) => 
//           q.search("title", search).eq("ownerId", userId)
//         )
//         .paginate(paginationOpts);
//     } else if (organizationId) {
//       result = await ctx.db
//         .query("documents")
//         .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
//         .paginate(paginationOpts);
//     } else {
//       result = await ctx.db
//         .query("documents")
//         .withIndex("by_owner_id", (q) => q.eq("ownerId", userId))
//         .paginate(paginationOpts);
//     }

//     // OPTIMIZATION: Only check drafts for organization results
//     if (organizationId && result.page.length > 0) {
//       const docIds = result.page.map(doc => doc._id);
//       const docsWithOtherDrafts = await getDocumentsWithOtherDrafts(docIds);
      
//       const filteredPage = result.page.filter(doc => 
//         !docsWithOtherDrafts.has(doc._id) || doc.ownerId === userId
//       );
      
//       return {
//         ...result,
//         page: filteredPage,
//       };
//     }

//     return result;
//   },
// });

// // 8. Remove by ID - OPTIMIZED: Batch delete operations
// export const removeById = mutation({
//   args: { id: v.id("documents") },
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const document = await ctx.db.get(args.id);

//     if (!document) throw new ConvexError("Document Not Found!");
    
//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Get all drafts first
//     const activeDrafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_document", (q) => q.eq("documentId", args.id))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     // OPTIMIZATION: Delete drafts in parallel
//     const deletePromises = activeDrafts.map(draft => ctx.db.delete(draft._id));
//     await Promise.all(deletePromises);

//     return await ctx.db.delete(args.id);
//   },
// });

// // 9. Update by ID - OPTIMIZED: Skip update if title unchanged
// export const updateById = mutation({
//   args: { id: v.id("documents"), title: v.string() },
//   handler: async(ctx, args) => { 
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const document = await ctx.db.get(args.id);

//     if (!document) throw new ConvexError("Document Not Found!");
    
//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Only update if title actually changed
//     if (document.title !== args.title) {
//       await ctx.db.patch(args.id, { title: args.title });
//       return { updated: true };
//     }
    
//     return { unchanged: true };
//   },
// });

// // 10. Get by ID - OPTIMIZED: Reduce data for non-owners
// export const getById = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, { id }) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(id);
//     if (!document) throw new ConvexError("Document not found");

//     const userId = user.subject;
    
//     if (document.ownerId !== userId) {
//       const anyActiveDraft = await ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", id))
//         .filter((q) => q.eq(q.field("isActive"), true))
//         .first();
      
//       if (anyActiveDraft) {
//         // OPTIMIZATION: Return minimal data for non-owners with active drafts
//         return {
//           _id: document._id,
//           title: document.title,
//           ownerId: document.ownerId,
//           organizationId: document.organizationId,
//           initialContent: document.publishedContent || document.initialContent || "",
//           _draftBlocked: true,
//         };
//       }
//     }

//     return document;
//   },
// });

// // 11. Get with draft - CRITICAL OPTIMIZATION (4.13 KB)
// export const getWithDraft = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     // OPTIMIZATION: Get document and draft in parallel
//     const [document, draftChecks] = await Promise.all([
//       ctx.db.get(args.id),
//       // Check for drafts in parallel
//       (async () => {
//         const userId = user.subject;
        
//         const [otherUserDraft, userDraft] = await Promise.all([
//           // Check if user has access to this draft
//           ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.eq(q.field("ownerId"), userId)
//               )
//             )
//             .first(),
//           // Get user's active draft
//           ctx.db
//             .query("draftDocuments")
//             .withIndex("by_owner_active", (q) =>
//               q.eq("ownerId", userId).eq("isActive", true)
//             )
//             .filter((q) => q.eq(q.field("documentId"), args.id))
//             .first()
//         ]);
        
//         return { otherUserDraft, userDraft, userId };
//       })()
//     ]);

//     if (!document) throw new ConvexError("Document not found");

//     const { otherUserDraft, userDraft, userId } = draftChecks;

//     if (document.ownerId !== userId && !otherUserDraft) {
//       // Non-owner without draft access
//       return {
//         ...document,
//         hasActiveDraft: false,
//         activeDraftId: null,
//         draftContent: null,
//         draftExpiresAt: null,
//         isInDraftMode: false,
//         initialContent: document.publishedContent || document.initialContent || "",
//       };
//     }

//     return {
//       ...document,
//       hasActiveDraft: !!userDraft,
//       activeDraftId: userDraft?._id,
//       draftContent: userDraft?.content,
//       draftExpiresAt: userDraft?.expiresAt,
//       isInDraftMode: !!userDraft,
//     };
//   },
// });

// // 12. Update content - CRITICAL OPTIMIZATION (4.56 KB)
// export const updateContent = mutation({
//   args: {
//     id: v.id("documents"),
//     content: v.string(),
//   },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(args.id);
//     if (!document) throw new ConvexError("Document not found");

//     const isOwner = document.ownerId === user.subject;
//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Check for active draft
//     const activeDraft = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner_active", (q) =>
//         q.eq("ownerId", user.subject).eq("isActive", true)
//       )
//       .filter((q) => q.eq(q.field("documentId"), args.id))
//       .first();

//     if (activeDraft) {
//       throw new ConvexError(
//         "Cannot update document while in draft mode. Publish or discard draft first."
//       );
//     }

//     // OPTIMIZATION: Only update if content changed
//     if (document.initialContent !== args.content) {
//       await ctx.db.patch(args.id, {
//         initialContent: args.content,
//       });
//     }

//     // OPTIMIZATION: Return minimal response
//     return { updated: true };
//   },
// });

// // 13. Publish content - OPTIMIZED: Minimal response
// export const publishContent = mutation({
//   args: {
//     id: v.id("documents"),
//     content: v.string(),
//   },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(args.id);
//     if (!document) throw new ConvexError("Document not found");

//     await ctx.db.patch(args.id, {
//       initialContent: args.content,
//       publishedContent: args.content,
//       lastPublishedAt: Date.now(),
//     });

//     return { published: true };
//   },
// });

// // 14. Cleanup user drafts - OPTIMIZED: Use better filtering
// export const cleanupUserDrafts = mutation({
//   args: {
//     userId: v.string(),
//     organizationId: v.optional(v.string()),
//   },
//   handler: async (ctx, args) => {
//     // Get active drafts for this user
//     const activeDrafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     // OPTIMIZATION: Update in parallel
//     const updatePromises = activeDrafts.map(draft =>
//       ctx.db.patch(draft._id, { isActive: false })
//     );

//     await Promise.all(updatePromises);

//     return { archivedDrafts: activeDrafts.length };
//   },
// });

// import { ConvexError, v } from "convex/values";
// import { mutation, query } from "./_generated/server";
// import { paginationOptsValidator } from "convex/server";
// import { Id } from "./_generated/dataModel";

// // 1. Get draft status - OPTIMIZED: Parallel queries
// export const getDraftStatus = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     const userId = user.subject;
    
//     // OPTIMIZATION: Run both draft checks in parallel
//     const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_owner_active", (q) =>
//           q.eq("ownerId", userId).eq("isActive", true)
//         )
//         .filter((q) => q.eq(q.field("documentId"), args.id))
//         .first(),
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", args.id))
//         .filter((q) => 
//           q.and(
//             q.eq(q.field("isActive"), true),
//             q.neq(q.field("ownerId"), userId)
//           )
//         )
//         .first()
//     ]);

//     return {
//       hasUserDraft: !!userActiveDraft,
//       hasOtherUserDraft: !!otherUserActiveDraft,
//       isOwner: document.ownerId === userId,
//       userCanEdit: document.ownerId === userId || !otherUserActiveDraft,
//       userCanView: !otherUserActiveDraft || document.ownerId === userId,
//     };
//   },
// });

// // 2. Public document query - OPTIMIZED: Already minimal
// export const getDocumentPublic = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     return {
//       _id: document._id,
//       ownerId: document.ownerId,
//       organizationId: document.organizationId,
//     };
//   },
// });

// // 3. Document for auth - OPTIMIZED: Already minimal
// export const getDocumentForAuth = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     return {
//       _id: document._id,
//       title: document.title,
//       ownerId: document.ownerId,
//       organizationId: document.organizationId,
//     };
//   },
// });

// // 4. Document room info - CRITICAL OPTIMIZATION (6.82 KB)
// export const getDocumentRoomInfo = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) return null;

//     const document = await ctx.db.get(args.id);
//     if (!document) return null;

//     const userId = user.subject;
//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
    
//     // OPTIMIZATION: Run queries in parallel
//     const [userActiveDraft, otherUserActiveDraft] = await Promise.all([
//       // User's active draft
//       ctx.db
//         .query("draftDocuments")
//         .withIndex("by_owner_active", (q) =>
//           q.eq("ownerId", userId).eq("isActive", true)
//         )
//         .filter((q) => q.eq(q.field("documentId"), args.id))
//         .first(),
//       // Other user's active draft
//       organizationId 
//         ? ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), organizationId)
//               )
//             )
//             .first()
//         : ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.neq(q.field("ownerId"), userId),
//                 q.eq(q.field("organizationId"), undefined)
//               )
//             )
//             .first()
//     ]);

//     const shouldEnableLiveBlocks = !userActiveDraft && !otherUserActiveDraft;

//     // OPTIMIZATION: Remove redundant fields to reduce bandwidth
//     return {
//       roomId: document.roomId || document._id,
//       shouldEnableLiveBlocks,
//       isOwner: document.ownerId === userId,
//       // Removed: documentId (same as args.id), hasUserDraft, hasOtherUserDraft
//     };
//   },
// });

// // 5. Get by IDs - OPTIMIZED: Use Promise.all for parallel gets
// export const getByIds = query({
//   args: { ids: v.array(v.id("documents")) },
//   handler: async (ctx, { ids }) => {
//     // OPTIMIZATION: Get all documents in parallel
//     const documentPromises = ids.map(id => ctx.db.get(id));
//     const documents = await Promise.all(documentPromises);

//     return documents.map((document, index) => {
//       if (document) {
//         return { id: document._id, name: document.title };
//       } else {
//         return { id: ids[index], name: "[Removed]" };
//       }
//     });
//   },
// });

// // 6. Create document - No optimization needed
// export const create = mutation({
//   args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;

//     return await ctx.db.insert("documents", {
//       title: args.title ?? "Untitled Document",
//       ownerId: user.subject,
//       organizationId,
//       initialContent: args.initialContent || "",
//     });
//   },
// });

// // 7. Get documents with search - OPTIMIZED: Reduce N+1 queries
// export const get = query({
//   args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
//   handler: async (ctx, { search, paginationOpts }) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const userId = user.subject;

//     // OPTIMIZATION: Pre-compute which documents have other user drafts
//     const getDocumentsWithOtherDrafts = async (docIds: Id<"documents">[]) => {
//       if (docIds.length === 0) return new Set<string>();
      
//       // Get all drafts for these documents in one query
//       const otherDrafts = await ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", docIds[0]))
//         .filter((q) => 
//           q.and(
//             q.eq(q.field("isActive"), true),
//             q.neq(q.field("ownerId"), userId)
//           )
//         )
//         .collect();
      
//       // For multiple documents, we need to filter in JavaScript
//       return new Set(otherDrafts.map(d => d.documentId));
//     };

//     let result;
//     if (search && organizationId) {
//       result = await ctx.db
//         .query("documents")
//         .withSearchIndex("search_title", (q) =>
//           q.search("title", search).eq("organizationId", organizationId)
//         )
//         .paginate(paginationOpts);
//     } else if (search) {
//       result = await ctx.db
//         .query("documents")
//         .withSearchIndex("search_title", (q) => 
//           q.search("title", search).eq("ownerId", userId)
//         )
//         .paginate(paginationOpts);
//     } else if (organizationId) {
//       result = await ctx.db
//         .query("documents")
//         .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
//         .paginate(paginationOpts);
//     } else {
//       result = await ctx.db
//         .query("documents")
//         .withIndex("by_owner_id", (q) => q.eq("ownerId", userId))
//         .paginate(paginationOpts);
//     }

//     // OPTIMIZATION: Only check drafts for organization results
//     if (organizationId && result.page.length > 0) {
//       const docIds = result.page.map(doc => doc._id);
//       const docsWithOtherDrafts = await getDocumentsWithOtherDrafts(docIds);
      
//       const filteredPage = result.page.filter(doc => 
//         !docsWithOtherDrafts.has(doc._id) || doc.ownerId === userId
//       );
      
//       return {
//         ...result,
//         page: filteredPage,
//       };
//     }

//     return result;
//   },
// });

// // 8. Remove by ID - OPTIMIZED: Batch delete operations
// export const removeById = mutation({
//   args: { id: v.id("documents") },
//   handler: async(ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const document = await ctx.db.get(args.id);

//     if (!document) throw new ConvexError("Document Not Found!");
    
//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Get all drafts first
//     const activeDrafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_document", (q) => q.eq("documentId", args.id))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     // OPTIMIZATION: Delete drafts in parallel
//     const deletePromises = activeDrafts.map(draft => ctx.db.delete(draft._id));
//     await Promise.all(deletePromises);

//     return await ctx.db.delete(args.id);
//   },
// });

// // 9. Update by ID - OPTIMIZED: Skip update if title unchanged
// export const updateById = mutation({
//   args: { id: v.id("documents"), title: v.string() },
//   handler: async(ctx, args) => { 
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const document = await ctx.db.get(args.id);

//     if (!document) throw new ConvexError("Document Not Found!");
    
//     const isOwner = document.ownerId === user.subject;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Only update if title actually changed
//     if (document.title !== args.title) {
//       await ctx.db.patch(args.id, { title: args.title });
//       return { updated: true };
//     }
    
//     return { unchanged: true };
//   },
// });

// // 10. Get by ID - OPTIMIZED: Reduce data for non-owners
// export const getById = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, { id }) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(id);
//     if (!document) throw new ConvexError("Document not found");

//     const userId = user.subject;
    
//     if (document.ownerId !== userId) {
//       const anyActiveDraft = await ctx.db
//         .query("draftDocuments")
//         .withIndex("by_document", (q) => q.eq("documentId", id))
//         .filter((q) => q.eq(q.field("isActive"), true))
//         .first();
      
//       if (anyActiveDraft) {
//         // OPTIMIZATION: Return minimal data for non-owners with active drafts
//         return {
//           _id: document._id,
//           title: document.title,
//           ownerId: document.ownerId,
//           organizationId: document.organizationId,
//           initialContent: document.publishedContent || document.initialContent || "",
//           _draftBlocked: true,
//         };
//       }
//     }

//     return document;
//   },
// });

// // 11. Get with draft - CRITICAL OPTIMIZATION (4.13 KB)
// export const getWithDraft = query({
//   args: { id: v.id("documents") },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     // OPTIMIZATION: Get document and draft in parallel
//     const [document, draftChecks] = await Promise.all([
//       ctx.db.get(args.id),
//       // Check for drafts in parallel
//       (async () => {
//         const userId = user.subject;
        
//         const [otherUserDraft, userDraft] = await Promise.all([
//           // Check if user has access to this draft
//           ctx.db
//             .query("draftDocuments")
//             .withIndex("by_document", (q) => q.eq("documentId", args.id))
//             .filter((q) => 
//               q.and(
//                 q.eq(q.field("isActive"), true),
//                 q.eq(q.field("ownerId"), userId)
//               )
//             )
//             .first(),
//           // Get user's active draft
//           ctx.db
//             .query("draftDocuments")
//             .withIndex("by_owner_active", (q) =>
//               q.eq("ownerId", userId).eq("isActive", true)
//             )
//             .filter((q) => q.eq(q.field("documentId"), args.id))
//             .first()
//         ]);
        
//         return { otherUserDraft, userDraft, userId };
//       })()
//     ]);

//     if (!document) throw new ConvexError("Document not found");

//     const { otherUserDraft, userDraft, userId } = draftChecks;

//     if (document.ownerId !== userId && !otherUserDraft) {
//       // Non-owner without draft access
//       return {
//         ...document,
//         hasActiveDraft: false,
//         activeDraftId: null,
//         draftContent: null,
//         draftExpiresAt: null,
//         isInDraftMode: false,
//         initialContent: document.publishedContent || document.initialContent || "",
//       };
//     }

//     return {
//       ...document,
//       hasActiveDraft: !!userDraft,
//       activeDraftId: userDraft?._id,
//       draftContent: userDraft?.content,
//       draftExpiresAt: userDraft?.expiresAt,
//       isInDraftMode: !!userDraft,
//     };
//   },
// });

// // 12. Update content - CRITICAL OPTIMIZATION (4.56 KB)
// export const updateContent = mutation({
//   args: {
//     id: v.id("documents"),
//     content: v.string(),
//   },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(args.id);
//     if (!document) throw new ConvexError("Document not found");

//     const isOwner = document.ownerId === user.subject;
//     const organizationId = (user.organization_id ?? undefined) as string | undefined;
//     const isOrganizationMember = 
//       !!(document.organizationId && document.organizationId === organizationId);

//     if (!isOwner && !isOrganizationMember) {
//       throw new ConvexError("Unauthorized");
//     }

//     // OPTIMIZATION: Check for active draft
//     const activeDraft = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner_active", (q) =>
//         q.eq("ownerId", user.subject).eq("isActive", true)
//       )
//       .filter((q) => q.eq(q.field("documentId"), args.id))
//       .first();

//     if (activeDraft) {
//       throw new ConvexError(
//         "Cannot update document while in draft mode. Publish or discard draft first."
//       );
//     }

//     // OPTIMIZATION: Only update if content changed
//     if (document.initialContent !== args.content) {
//       await ctx.db.patch(args.id, {
//         initialContent: args.content,
//       });
//     }

//     // OPTIMIZATION: Return minimal response
//     return { updated: true };
//   },
// });

// // 13. Publish content - OPTIMIZED: Minimal response
// export const publishContent = mutation({
//   args: {
//     id: v.id("documents"),
//     content: v.string(),
//   },
//   handler: async (ctx, args) => {
//     const user = await ctx.auth.getUserIdentity();
//     if (!user) throw new ConvexError("Unauthorized");

//     const document = await ctx.db.get(args.id);
//     if (!document) throw new ConvexError("Document not found");

//     await ctx.db.patch(args.id, {
//       initialContent: args.content,
//       publishedContent: args.content,
//       lastPublishedAt: Date.now(),
//     });

//     return { published: true };
//   },
// });

// // 14. Cleanup user drafts - OPTIMIZED: Use better filtering
// export const cleanupUserDrafts = mutation({
//   args: {
//     userId: v.string(),
//     organizationId: v.optional(v.string()),
//   },
//   handler: async (ctx, args) => {
//     // Get active drafts for this user
//     const activeDrafts = await ctx.db
//       .query("draftDocuments")
//       .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
//       .filter((q) => q.eq(q.field("isActive"), true))
//       .collect();

//     // OPTIMIZATION: Update in parallel
//     const updatePromises = activeDrafts.map(draft =>
//       ctx.db.patch(draft._id, { isActive: false })
//     );

//     await Promise.all(updatePromises);

//     return { archivedDrafts: activeDrafts.length };
//   },
// });




// // import { ConvexError, v } from "convex/values";
// // import { mutation, query, action } from "./_generated/server";
// // import { paginationOptsValidator } from "convex/server";
// // import { api } from "./_generated/api";
// // import { Id } from "./_generated/dataModel";

// // // Add this to check if a document is in draft mode for current user
// // export const getDraftStatus = query({
// //   args: { id: v.id("documents") },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) return null;

// //     const document = await ctx.db.get(args.id);
// //     if (!document) return null;

// //     const userId = user.subject;
    
// //     // Check if current user has an active draft
// //     const userActiveDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_owner_active", (q) =>
// //         q.eq("ownerId", userId).eq("isActive", true)
// //       )
// //       .filter((q) => q.eq(q.field("documentId"), args.id))
// //       .first();

// //     // Check if ANY other user has an active draft
// //     const otherUserActiveDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_document", (q) => q.eq("documentId", args.id))
// //       .filter((q) => 
// //         q.and(
// //           q.eq(q.field("isActive"), true),
// //           q.neq(q.field("ownerId"), userId)
// //         )
// //       )
// //       .first();

// //     return {
// //       hasUserDraft: !!userActiveDraft,
// //       hasOtherUserDraft: !!otherUserActiveDraft,
// //       isOwner: document.ownerId === userId,
// //       userCanEdit: document.ownerId === userId || !otherUserActiveDraft,
// //       userCanView: !otherUserActiveDraft || document.ownerId === userId,
// //     };
// //   },
// // });

// // // Add this PUBLIC query (no auth checks for document existence)
// // export const getDocumentPublic = query({
// //   args: { id: v.id("documents") },
// //   handler: async (ctx, args) => {
// //     // NO auth check - just get the document
// //     const document = await ctx.db.get(args.id);
    
// //     if (!document) {
// //       return null;
// //     }

// //     // Return minimal info for LiveBlocks auth
// //     return {
// //       _id: document._id,
// //       ownerId: document.ownerId,
// //       organizationId: document.organizationId,
// //       // Add other fields you need for auth
// //     };
// //   },
// // });

// // // Add this simple query for LiveBlocks auth
// // export const getDocumentForAuth = query({
// //   args: { id: v.id("documents") },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) return null;

// //     const document = await ctx.db.get(args.id);
// //     if (!document) return null;

// //     // Return minimal document info for auth
// //     return {
// //       _id: document._id,
// //       title: document.title,
// //       ownerId: document.ownerId,
// //       organizationId: document.organizationId,
// //     };
// //   },
// // });

// // // Add this function to check if document should have LiveBlocks enabled
// // export const getDocumentRoomInfo = query({
// //   args: { id: v.id("documents") },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) return null;

// //     const document = await ctx.db.get(args.id);
// //     if (!document) return null;

// //     const userId = user.subject;
// //     const organizationId = (user.organization_id ?? undefined) as string | undefined;
    
// //     // Check if current user has an active draft
// //     const userActiveDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_owner_active", (q) =>
// //         q.eq("ownerId", userId).eq("isActive", true)
// //       )
// //       .filter((q) => q.eq(q.field("documentId"), args.id))
// //       .first();

// //     // Check if ANY other user has an active draft
// //     const otherUserActiveDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_document", (q) => q.eq("documentId", args.id))
// //       .filter((q) => 
// //         q.and(
// //           q.eq(q.field("isActive"), true),
// //           q.neq(q.field("ownerId"), userId),
// //           organizationId ? q.eq(q.field("organizationId"), organizationId) : q.eq(q.field("organizationId"), undefined)
// //         )
// //       )
// //       .first();

// //     // Determine if LiveBlocks should be enabled
// //     // Enable LiveBlocks if:
// //     // 1. User doesn't have an active draft AND
// //     // 2. No other user has an active draft
// //     const shouldEnableLiveBlocks = !userActiveDraft && !otherUserActiveDraft;

// //     return {
// //       roomId: document.roomId || document._id,
// //       shouldEnableLiveBlocks,
// //       isOwner: document.ownerId === userId,
// //       documentId: document._id,
// //       hasUserDraft: !!userActiveDraft,
// //       hasOtherUserDraft: !!otherUserActiveDraft,
// //     };
// //   },
// // });



// // export const getByIds = query ({
// //   args: {ids: v.array(v.id("documents")) },
// //   handler: async (ctx, {ids}) => {
// //     const documents = [];

// //     for (const id of ids){
// //       const document = await ctx.db.get(id);

// //       if(document){
// //         documents.push({id: document._id, name: document.title})
// //       } else {
// //         documents.push({id, name:"[Removed]"})
// //       }
// //     }

// //     return documents;
// //   },
// // });

// // export const create = mutation ({
// //   args: { title: v.optional(v.string()), initialContent: v.optional(v.string()) },
// //   handler: async(ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();

// //     if(!user){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const organizationId = (user.organization_id ?? undefined) as
// //       | string
// //       | undefined;

// //     return await ctx.db.insert("documents", {
// //       title: args.title ?? "Untitled Document",
// //       ownerId: user.subject,
// //       organizationId,
// //       initialContent: args.initialContent || "",
// //     });

// //   },
// // });

// // // Replace the existing 'get' query function with this one:
// // export const get = query({
// //   args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
// //   handler: async (ctx, {search, paginationOpts}) => {
// //     const user = await ctx.auth.getUserIdentity();

// //     if(!user) {
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const organizationId = (user.organization_id ?? undefined) as
// //       | string
// //       | undefined;
// //     const userId = user.subject;

// //     // NEW: Function to check if a document has active drafts by other users
// //     const hasOtherUserActiveDraft = async (documentId: Id<"documents">) => {
// //       const otherUserDraft = await ctx.db
// //         .query("draftDocuments")
// //         .withIndex("by_document", (q) => q.eq("documentId", documentId))
// //         .filter((q) => 
// //           q.and(
// //             q.eq(q.field("isActive"), true),
// //             q.neq(q.field("ownerId"), userId)
// //           )
// //         )
// //         .first();
      
// //       return !!otherUserDraft;
// //     };

// //     // SEARCH inside organization
// //     if(search && organizationId){
// //       const result = await ctx.db
// //         .query("documents")
// //         .withSearchIndex("search_title", (q) =>
// //           q.search("title", search).eq("organizationId", organizationId)
// //         )
// //         .paginate(paginationOpts);
      
// //       // Filter out documents with other users' drafts
// //       const filteredPage = [];
// //       for (const doc of result.page) {
// //         const hasOtherDraft = await hasOtherUserActiveDraft(doc._id);
// //         if (!hasOtherDraft || doc.ownerId === userId) {
// //           filteredPage.push(doc);
// //         }
// //       }
      
// //       return {
// //         ...result,
// //         page: filteredPage,
// //       };
// //     }

// //     // SEARCH inside personal
// //     if(search){
// //       const result = await ctx.db
// //         .query("documents")
// //         .withSearchIndex("search_title", (q) => 
// //           q.search("title", search).eq("ownerId", userId)
// //         )
// //         .paginate(paginationOpts);
      
// //       return result; // Personal docs always show to owner
// //     }

// //     // ALL docs inside organization
// //     if(organizationId){
// //       const result = await ctx.db
// //         .query("documents")
// //         .withIndex("by_organization_id", (q) => q.eq("organizationId", organizationId))
// //         .paginate(paginationOpts);
      
// //       // Filter out documents with other users' drafts
// //       const filteredPage = [];
// //       for (const doc of result.page) {
// //         const hasOtherDraft = await hasOtherUserActiveDraft(doc._id);
// //         if (!hasOtherDraft || doc.ownerId === userId) {
// //           filteredPage.push(doc);
// //         }
// //       }
      
// //       return {
// //         ...result,
// //         page: filteredPage,
// //       };
// //     }

// //     // docs inside personal
// //     return await ctx.db
// //       .query("documents")
// //       .withIndex("by_owner_id", (q) => q.eq("ownerId", userId))
// //       .paginate(paginationOpts);
// //   },
// // });
// // //en

// // export const removeById = mutation({
// //   args: {id: v.id("documents")},
// //   handler: async(ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();

// //     if(!user){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const organizationId = (user.organization_id ?? undefined) as
// //       | string
// //       | undefined;

// //     const document = await ctx.db.get(args.id);

// //     if(!document){
// //       throw new ConvexError("Document Not Found!");
// //     }

// //     const isOwner = document.ownerId === user.subject;
// //     const isOrganizationMember = 
// //       !!(document.organizationId && document.organizationId === organizationId);

// //     if(!isOwner && !isOrganizationMember){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     // Also delete any active drafts for this document
// //     const activeDrafts = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_document", (q) => q.eq("documentId", args.id))
// //       .filter((q) => q.eq(q.field("isActive"), true))
// //       .collect();

// //     for (const draft of activeDrafts) {
// //       await ctx.db.delete(draft._id);
// //     }

// //     return await ctx.db.delete(args.id);
// //   },
// // });

// // export const updateById = mutation({
// //   args: {id: v.id("documents"), title: v.string()},
// //   handler: async(ctx, args) => { 
// //     const user = await ctx.auth.getUserIdentity();

// //     if(!user){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const organizationId = (user.organization_id ?? undefined) as
// //       | string
// //       | undefined;

// //     const document = await ctx.db.get(args.id);

// //     if(!document){
// //       throw new ConvexError("Document Not Found!");
// //     }

// //     const isOwner = document.ownerId === user.subject;
// //     const isOrganizationMember = 
// //       !!(document.organizationId && document.organizationId === organizationId);

// //     if(!isOwner && !isOrganizationMember){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     return await ctx.db.patch(args.id, {title: args.title});
// //   },
// // });

// // export const getById = query({
// //   args:{ id: v.id("documents")},
// //   handler: async (ctx, { id }) => {
// //     const user = await ctx.auth.getUserIdentity();
    
// //     if(!user){
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const document = await ctx.db.get(id);

// //     if(!document){
// //       throw new ConvexError("Document not found");
// //     }

// //     const userId = user.subject;
    
// //     // If user is not the owner, check if they should see published content only
// //     if (document.ownerId !== userId) {
// //       // Check if any user has an active draft for this document
// //       const anyActiveDraft = await ctx.db
// //         .query("draftDocuments")
// //         .withIndex("by_document", (q) => q.eq("documentId", id))
// //         .filter((q) => q.eq(q.field("isActive"), true))
// //         .first();
      
// //       // If there's an active draft, non-owners should get published content
// //       if (anyActiveDraft) {
// //         return {
// //           ...document,
// //           // Return published content instead of draft content
// //           initialContent: document.publishedContent || document.initialContent || "",
// //           _draftBlocked: true, // Flag that draft is hidden
// //         };
// //       }
// //     }

// //     return document;
// //   },
// // });
// // //en
// // export const getWithDraft = query({
// //   args: { id: v.id("documents") },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) {
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const document = await ctx.db.get(args.id);
    
// //     if (!document) {
// //       throw new ConvexError("Document not found");
// //     }

// //     const userId = user.subject;
    
// //     // CHECK: Is user the owner?
// //     if (document.ownerId !== userId) {
// //       // Non-owner trying to access - check if they have draft access
// //       const otherUserActiveDraft = await ctx.db
// //         .query("draftDocuments")
// //         .withIndex("by_document", (q) => q.eq("documentId", args.id))
// //         .filter((q) => 
// //           q.and(
// //             q.eq(q.field("isActive"), true),
// //             q.eq(q.field("ownerId"), userId) // This user's draft
// //           )
// //         )
// //         .first();
      
// //       // If user doesn't have their own draft, they can't see draft content
// //       if (!otherUserActiveDraft) {
// //         // Return only published content for non-owners
// //         return {
// //           ...document,
// //           hasActiveDraft: false,
// //           activeDraftId: null,
// //           draftContent: null, // HIDE draft content
// //           draftExpiresAt: null,
// //           isInDraftMode: false,
// //           // Show published content instead of initial content
// //           initialContent: document.publishedContent || document.initialContent || "",
// //         };
// //       }
// //     }

// //     // Owner or user with their own draft can see everything
// //     const activeDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_owner_active", (q) =>
// //         q.eq("ownerId", userId).eq("isActive", true)
// //       )
// //       .filter((q) => q.eq(q.field("documentId"), args.id))
// //       .first();

// //     return {
// //       ...document,
// //       hasActiveDraft: !!activeDraft,
// //       activeDraftId: activeDraft?._id,
// //       draftContent: activeDraft?.content,
// //       draftExpiresAt: activeDraft?.expiresAt,
// //       isInDraftMode: !!activeDraft,
// //     };
// //   },
// // });

// // // NEW: Update document content (for regular edits when not in draft mode)
// // export const updateContent = mutation({
// //   args: {
// //     id: v.id("documents"),
// //     content: v.string(),
// //   },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) {
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const document = await ctx.db.get(args.id);
// //     if (!document) {
// //       throw new ConvexError("Document not found");
// //     }

// //     const isOwner = document.ownerId === user.subject;
// //     const organizationId = (user.organization_id ?? undefined) as string | undefined;
// //     const isOrganizationMember = 
// //       !!(document.organizationId && document.organizationId === organizationId);

// //     if (!isOwner && !isOrganizationMember) {
// //       throw new ConvexError("Unauthorized");
// //     }

// //     // Check if user has an active draft
// //     const activeDraft = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_owner_active", (q) =>
// //         q.eq("ownerId", user.subject).eq("isActive", true)
// //       )
// //       .filter((q) => q.eq(q.field("documentId"), args.id))
// //       .first();

// //     if (activeDraft) {
// //       throw new ConvexError(
// //         "Cannot update document while in draft mode. Publish or discard draft first."
// //       );
// //     }

// //     // Update main document
// //     await ctx.db.patch(args.id, {
// //       initialContent: args.content,
// //     });
// //   },
// // });

// // // NEW: Publish content from draft (used by draft.publishDraft)
// // export const publishContent = mutation({
// //   args: {
// //     id: v.id("documents"),
// //     content: v.string(),
// //   },
// //   handler: async (ctx, args) => {
// //     const user = await ctx.auth.getUserIdentity();
// //     if (!user) {
// //       throw new ConvexError("Unauthorized");
// //     }

// //     const document = await ctx.db.get(args.id);
// //     if (!document) {
// //       throw new ConvexError("Document not found");
// //     }

// //     // Update main document with published content
// //     await ctx.db.patch(args.id, {
// //       initialContent: args.content,
// //       publishedContent: args.content, // Store as published version
// //       lastPublishedAt: Date.now(),
// //     });
// //   },
// // });

// // // NEW: Clean up drafts when user leaves organization
// // // NEW: Clean up drafts when user leaves organization
// // // FIXED: Changed from action to mutation
// // export const cleanupUserDrafts = mutation({
// //   args: {
// //     userId: v.string(),
// //     organizationId: v.optional(v.string()),
// //   },
// //   handler: async (ctx, args) => {
// //     // Archive all active drafts for this user
// //     const activeDrafts = await ctx.db
// //       .query("draftDocuments")
// //       .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
// //       .collect();

// //     // Filter in JavaScript for isActive
// //     const filteredDrafts = activeDrafts.filter(draft => draft.isActive);

// //     for (const draft of filteredDrafts) {
// //       await ctx.db.patch(draft._id, {
// //         isActive: false,
// //       });
// //     }

// //     return { archivedDrafts: filteredDrafts.length };
// //   },
// // });




