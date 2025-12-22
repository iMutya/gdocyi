import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  documents: defineTable({
    title: v.string(),
    initialContent: v.optional(v.string()),
    ownerId: v.string(),
    roomId: v.optional(v.string()),
    organizationalId: v.optional(v.string()),
  })
  .index("by_owner_id", ["ownerId"])
  .index("by_organizational_id", ["organizationalId"])
  .searchIndex("search_title", {
    searchField: "title",
    filterFields: ["ownerId", "organizationalId"],
  })
});