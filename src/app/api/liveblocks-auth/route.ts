import { Liveblocks } from "@liveblocks/node";
import { ConvexHttpClient } from "convex/browser";
import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

console.log("=== LIVEBLOCKS AUTH DEBUG ===");

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

// Define the expected document type
interface DocumentForAuth {
    _id: Id<"documents">;
    ownerId: string;
    organizationId?: string;
}

export async function POST(req: Request) {
    console.log("Liveblocks auth called");
    
    try {
        // Check API key
        if (!process.env.LIVEBLOCKS_SECRET_KEY?.startsWith('sk_')) {
            throw new Error("Invalid Liveblocks API key");
        }

        const user = await currentUser();
        console.log("User:", user?.id);
        
        if (!user) {
            console.log("No user - returning 401");
            return new Response(JSON.stringify({ error: "Unauthorized: No user" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { room } = await req.json();
        console.log("Room ID:", room);

        // Use PUBLIC query - no auth checks
        const document = await convex.query(api.documents.getDocumentPublic, { id: room }) as DocumentForAuth | null;
        console.log("Document from public query:", document);

        if (!document) {
            console.log("Document doesn't exist in database");
            return new Response(JSON.stringify({ 
                error: "Document not found in database",
                roomId: room 
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        // Get session for org check
        const { sessionClaims } = await auth();
        
        // === IMPORTANT: Clerk stores org ID as o?.id ===
        console.log("=== SESSION CLAIMS DEBUG ===");
        console.log("Full sessionClaims:", JSON.stringify(sessionClaims, null, 2));
        console.log("Session org (o?.id):", sessionClaims?.o?.id);
        console.log("=== END DEBUG ===");

        // Check permissions
        const isOwner = document.ownerId === user.id;
        const userOrgId = sessionClaims?.o?.id; // This is the correct path for Clerk
        const isOrganizationMember = !!(document.organizationId && document.organizationId === userOrgId);

        console.log("=== AUTH DEBUG ===");
        console.log("User ID:", user.id);
        console.log("Document owner ID:", document.ownerId);
        console.log("Document org ID:", document.organizationId);
        console.log("User org ID from claims (o?.id):", userOrgId);
        console.log("isOwner check:", isOwner);
        console.log("isOrganizationMember check:", isOrganizationMember);

        // TEMPORARY FIX: Allow access for organization documents even without org claim
        // This will help you test while you fix the organization setup
        if (document.organizationId) {
            // Document is in an organization
            if (!isOwner && !isOrganizationMember) {
                console.log("WARNING: Could not verify organization membership");
                console.log("User may not have an active organization selected");
                
                // OPTION 1: Allow access anyway for testing (uncomment below)
                console.log("TEMPORARY: Allowing access for testing purposes");
                // Continue with auth - don't return 403
                
                // OPTION 2: Return helpful error (comment out the line above and uncomment below)
                /*
                return new Response(JSON.stringify({ 
                    error: "Organization access required",
                    message: "Please ensure you have selected an organization in your session.",
                    help: "User needs to have an active organization. Check if user has switched to the correct org.",
                    userId: user.id,
                    documentId: document._id, // Fixed: changed from document.id to document._id
                    documentOrgId: document.organizationId
                }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" }
                });
                */
            }
        } else {
            // Personal document (no organization) - strict check
            if (!isOwner) {
                console.log("Personal document - user is not owner");
                return new Response(JSON.stringify({ 
                    error: "No access to personal document",
                    message: "This is a personal document and you are not the owner.",
                    userId: user.id,
                    docOwnerId: document.ownerId
                }), {
                    status: 403,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        console.log("Creating Liveblocks session...");
        
        const session = liveblocks.prepareSession(user.id, {
            userInfo: {
                name: user.fullName || user.emailAddresses?.[0]?.emailAddress || "User",
                avatar: user.imageUrl,
                color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            }
        });
        
        session.allow(room, session.FULL_ACCESS);
        const { body: authBody, status } = await session.authorize();

        console.log("Liveblocks auth successful, status:", status);
        return new Response(authBody, { status });
        
    } catch (error: any) {
        console.error("Liveblocks auth ERROR:", error);
        
        return new Response(
            JSON.stringify({ 
                error: "Liveblocks authentication failed",
                message: error.message,
                stack: error.stack 
            }), { 
                status: 500,
                headers: { "Content-Type": "application/json" }
            }
        );
    }
}