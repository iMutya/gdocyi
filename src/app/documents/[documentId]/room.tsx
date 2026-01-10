"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  LiveblocksProvider,
  RoomProvider,
  ClientSideSuspense,
} from "@liveblocks/react/suspense";
import { useParams } from "next/navigation";
import { FullScreenLoader } from "@/components/fullscreen-loader";
import { getUsers, getDocuments } from "./action";
import { toast } from "sonner";
import { Id } from "../../../../convex/_generated/dataModel";
import { LEFT_MARGIN_DEFAULT, RIGHT_MARGIN_DEFAULT } from "@/constants/margin";

type User = {id: string; name:string; avatar:string; color:string;};

export function Room({ children }: { children: ReactNode }) {
    const params = useParams();
    const documentId = params.documentId as string;

    const [users, setUsers] = useState<User[]>([]);

    const fetchUsers = useCallback(async () => {
        try{
          const list = await getUsers();
          setUsers(list);
        } catch {
          toast.error("Failed to fetch users");
        }
      },
      [],
    );

    useEffect(() => {
      fetchUsers();
    }, [fetchUsers]);

  return (
    <LiveblocksProvider 
        throttle={16}
        authEndpoint={async () => {
          const endpoint = "/api/liveblocks-auth";
          const room = documentId;

          const response = await fetch(endpoint, {
            method: "POST",
            body: JSON.stringify({ room }),
          });

          return await response.json();
        }}
        resolveUsers={({userIds}) => {
          return userIds.map(
            (userId) => users.find((user) => user.id === userId) ?? undefined
          )
        }}
        resolveMentionSuggestions={({ text }) => {
          let filteredUsers = users;

          if(text){
            filteredUsers = users.filter((user) => 
              user.name.toLowerCase().includes(text.toLowerCase())
            );
          }

          return filteredUsers.map((user) => user.id)
        }}
        resolveRoomsInfo={async ({roomIds}) => {
          const documents = await getDocuments(roomIds as Id<"documents">[]);
          return documents.map((document) => ({
            id: document.id,
            name: document.name,
          }));
        }}
    >
      {/* ALWAYS render RoomProvider, even for drafts */}
      <RoomProvider 
        id={documentId} 
        initialPresence={{}}
        initialStorage={{ leftMargin: LEFT_MARGIN_DEFAULT, rightMargin: RIGHT_MARGIN_DEFAULT }}
      >
        <ClientSideSuspense fallback={<FullScreenLoader label="Room Loading..." />}>
          {children}
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}