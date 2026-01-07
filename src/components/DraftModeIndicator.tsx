// components/DraftModeIndicator.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";

interface DraftModeIndicatorProps {
  documentId: Id<"documents">;
}

export function DraftModeIndicator({ documentId }: DraftModeIndicatorProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const document = useQuery(api.documents.getWithDraft, { id: documentId });
  const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
  const publishDraft = useMutation(api.drafts.publishDraft);
  const discardDraft = useMutation(api.drafts.discardDraft);

  const handleToggleDraftMode = async () => {
    setIsLoading(true);
    try {
      if (document?.isInDraftMode && document.activeDraftId) {
        await discardDraft({ draftId: document.activeDraftId });
      } else {
        await getOrCreateDraft({ documentId });
      }
    } catch (error) {
      console.error("Error toggling draft mode:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!document?.activeDraftId) return;
    
    setIsLoading(true);
    try {
      await publishDraft({ draftId: document.activeDraftId });
    } catch (error) {
      console.error("Error publishing draft:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (document?.isInDraftMode) {
    const expiresIn = document.draftExpiresAt ? document.draftExpiresAt - Date.now() : 0;
    const hoursLeft = Math.max(0, Math.floor(expiresIn / (1000 * 60 * 60)));
    const minutesLeft = Math.max(0, Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60)));

    return (
      <div className="flex items-center gap-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-amber-500 text-white text-xs font-semibold rounded">
            DRAFT
          </div>
          <span className="text-sm text-amber-800">
            Editing privately • Expires in {hoursLeft}h {minutesLeft}m
          </span>
        </div>
        <div className="flex gap-2 ml-auto">
          <button
            onClick={handleToggleDraftMode}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Exit
          </button>
          <button
            onClick={handlePublish}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Publish Changes
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleToggleDraftMode}
      className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
    >
      <span className="text-gray-600">✏️</span>
      <span className="font-medium">Enter Draft Mode</span>
    </button>
  );
}