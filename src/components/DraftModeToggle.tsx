// components/DraftModeToggle.tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Pencil, Upload, X } from "lucide-react";

interface DraftModeToggleProps {
  documentId: Id<"documents">;
}

export function DraftModeToggle({ documentId }: DraftModeToggleProps) {
  const [isLoading, setIsLoading] = useState(false);
  
  const document = useQuery(api.documents.getWithDraft, { id: documentId });
  const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
  const publishDraft = useMutation(api.drafts.publishDraft);
  const discardDraft = useMutation(api.drafts.discardDraft);

  const handleEnterDraftMode = async () => {
    setIsLoading(true);
    try {
      await getOrCreateDraft({ documentId });
    } catch (error) {
      console.error("Failed to enter draft mode:", error);
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
      console.error("Failed to publish draft:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    if (!document?.activeDraftId) return;
    
    setIsLoading(true);
    try {
      await discardDraft({ draftId: document.activeDraftId });
    } catch (error) {
      console.error("Failed to discard draft:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (document?.isInDraftMode) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded-lg">
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-amber-800">Draft Mode</span>
        </div>
        
        <button
          onClick={handleDiscard}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
        >
          <X size={16} />
          <span>Discard</span>
        </button>
        
        <button
          onClick={handlePublish}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white hover:bg-green-700 rounded-lg disabled:opacity-50"
        >
          <Upload size={16} />
          <span>{isLoading ? "Publishing..." : "Publish"}</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleEnterDraftMode}
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg disabled:opacity-50 transition-colors"
    >
      <Pencil size={16} />
      <span>{isLoading ? "Entering..." : "Enter Draft Mode"}</span>
    </button>
  );
}