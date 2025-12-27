"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

export async function getUsers() {
    const {sessionClaims} = await auth();
    const clerk = await clerkClient();

    const response = await clerk.users.getUserList({
        // organizationId:[sessionClaims?.org_id as string],
        organizationId:[sessionClaims?.o.id as string] // if indi mag gana ang sa babaw
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
        };
    });

    return users;
}