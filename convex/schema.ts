// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    initialContent: v.optional(v.string()),
    ownerId: v.string(),
    roomId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    publishedContent: v.optional(v.string()), // Add published content field
    lastPublishedAt: v.optional(v.number()), // Track last publish time
  })
    .index("by_owner_id", ["ownerId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_room_id", ["roomId"]) // Add index for room lookups
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId", "organizationId"],
    }),

  // Draft documents table
  draftDocuments: defineTable({
    documentId: v.id("documents"), // Reference to main document
    content: v.string(), // Current draft content
    ownerId: v.string(), // Who created the draft
    roomId: v.optional(v.string()), // Copy roomId for Liveblocks
    createdAt: v.number(),
    expiresAt: v.number(), // Auto-expiration timestamp (24 hours)
    isActive: v.boolean(),
    lastUpdatedAt: v.number(), // Track last edit
  })
    .index("by_document", ["documentId"])
    .index("by_owner", ["ownerId"])
    .index("by_expires", ["expiresAt"]) // For cleanup queries
    .index("by_room", ["roomId"])
    .index("by_owner_active", ["ownerId", "isActive"]) // Find user's active drafts
});








// import { defineSchema, defineTable } from "convex/server";
// import { v } from "convex/values";

// export default defineSchema({
//   documents: defineTable({
//     title: v.string(),
//     initialContent: v.optional(v.string()),
//     ownerId: v.string(),
//     roomId: v.optional(v.string()),
//     organizationId: v.optional(v.string()),
//   })
//     .index("by_owner_id", ["ownerId"])
//     .index("by_organization_id", ["organizationId"])
//     .searchIndex("search_title", {
//       searchField: "title",
//       filterFields: ["ownerId", "organizationId"],
//     }),
    

// });