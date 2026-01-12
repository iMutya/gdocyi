import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    initialContent: v.optional(v.string()),
    ownerId: v.string(),
    roomId: v.optional(v.string()),
    organizationId: v.optional(v.string()),
    publishedContent: v.optional(v.string()), 
    lastPublishedAt: v.optional(v.number()), 
  })
    .index("by_owner_id", ["ownerId"])
    .index("by_organization_id", ["organizationId"])
    .index("by_room_id", ["roomId"]) 
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId", "organizationId"],
    }),

  draftDocuments: defineTable({
    documentId: v.id("documents"), 
    content: v.string(), 
    ownerId: v.string(), 
    ownerName: v.string(), 
    roomId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(), 
    isActive: v.boolean(),
    lastUpdatedAt: v.number(), 
    organizationId: v.optional(v.string())
  })
    .index("by_document", ["documentId"])
    .index("by_owner", ["ownerId"])
    .index("by_expires", ["expiresAt"]) 
    .index("by_room", ["roomId"])
    .index("by_owner_active", ["ownerId", "isActive"]) 
    .index("by_organization", ["organizationId"]), 
});





