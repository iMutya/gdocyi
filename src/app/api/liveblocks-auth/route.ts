import { Liveblocks } from "@liveblocks/node";
import { ConvexHttpClient } from "convex/browser";
import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";


const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const liveblocks = new Liveblocks({
    secret: process.env.LIVEBLOCKS_SECRET_KEY!,
});

interface DocumentForAuth {
    _id: Id<"documents">;
    ownerId: string;
    organizationId?: string;
}

export async function POST(req: Request) {    
    try {
        if (!process.env.LIVEBLOCKS_SECRET_KEY?.startsWith('sk_')) {
            throw new Error("Invalid Liveblocks API key");
        }

        const user = await currentUser();

        if (!user) {
            return new Response(JSON.stringify({ error: "Unauthorized: No user" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { room } = await req.json();
        const document = await convex.query(api.documents.getDocumentPublic, { id: room }) as DocumentForAuth | null;

        if (!document) {
            return new Response(JSON.stringify({ 
                error: "Document not found in database",
                roomId: room 
            }), {
                status: 404,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { sessionClaims } = await auth();

        const isOwner = document.ownerId === user.id;
        const userOrgId = (sessionClaims as any)?.o?.id;  
        const isOrganizationMember = !!(document.organizationId && document.organizationId === userOrgId);

        
        if (document.organizationId) {
            if (!isOwner && !isOrganizationMember) {          
            }
        } else {
            if (!isOwner) {
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
        
        const session = liveblocks.prepareSession(user.id, {
            userInfo: {
                name: user.fullName || user.emailAddresses?.[0]?.emailAddress || "User",
                avatar: user.imageUrl,
                color: `hsl(${Math.random() * 360}, 80%, 60%)`,
            }
        });
        
        session.allow(room, session.FULL_ACCESS);
        const { body: authBody, status } = await session.authorize();

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