"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function getDocuments(ids: Id<"documents">[]) {
    return await convex.query(api.documents.getByIds, {ids})
};

export async function getUsers() {
    const {sessionClaims} = await auth();
    const clerk = await clerkClient();

    type SessionClaimsWithOrg = {
        o?: {
            id: string;
        };
    };

    const orgId =
     typeof sessionClaims === "object" && sessionClaims !== null
        ? (sessionClaims as SessionClaimsWithOrg).o?.id
        : undefined;

    if(!orgId){
        return[];
    }
    

    const response = await clerk.users.getUserList({
        // organizationId:[sessionClaims?.org_id as string],
        organizationId:[orgId], // if indi mag gana ang sa babaw
    });
    

    const users = response.data.map((user) => {
        const name =
            user.fullName ||
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.primaryEmailAddress?.emailAddress ||
            "Anonymous";
            // clerk does not populate fullname unless you set it

        return {
            id: user.id,
            name,
            avatar: user.imageUrl,
            color: "",
        };
    });

    return users;
}