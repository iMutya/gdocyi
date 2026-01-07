import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createDraft = mutation({
    args:{
        documentId: v.id("documents"),
        userId: v.string(),
    },

    handler: async(ctx, args) => {
        const {documentId, userId} = args;

        // check ya if there's existing draft to avoid duplications
        const existingDraft = await ctx.db
            .query("drafts")
            .withIndex("by_document_and_user", q => 
                q.eq("documentId", documentId).eq("userId", userId)
            )
            .first();

            if(existingDraft){
                return existingDraft;
            }

            // ang content sang draft dapat ang published one like basta ang current copy
            const document = await ctx.db.get(documentId);
            if(!document){
                return new Error("Document not found")
            }

            const draftId = await ctx.db.insert("drafts", {
                documentId,
                userId,
                content: document.initialContent ?? "", // kay ang iban na contents wala unod kag para ma prevent ang bugs
                createdAt: Date.now(),
            });

            return await ctx.db.get(draftId);
    },
});

export const getUserDraft = query({
    args:{
        documentId: v.id("documents"),
        userId: v.string(),
    },

    handler: async(ctx, args) => {
        
    }
})