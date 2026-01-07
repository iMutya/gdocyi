"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { Editor } from "./editor";
import { Navbar } from "./navbar";
import { Room } from "./room";
import { Toolbar } from "./toolbar";
import { api } from "../../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery } from "convex/react";

interface DocumentProps {
    preloadedDocument: Preloaded<typeof api.documents.getWithDraft>;
    userId?: string; // Optional, but don't pass to Navbar if not needed
};

export const Document = ({ preloadedDocument, userId }: DocumentProps) => {
    const documentWithDraft = usePreloadedQuery(preloadedDocument);
    
    // Get the active draft separately for real-time updates
    const activeDraft = useQuery(api.drafts.getActiveDraft, {
        documentId: documentWithDraft?._id,
    });

    // State for draft mode
    const [isDraftMode, setIsDraftMode] = useState(false);
    const [currentContent, setCurrentContent] = useState<string | undefined>();

    // Update draft mode status and content
    useEffect(() => {
        if (activeDraft) {
            setIsDraftMode(true);
            setCurrentContent(activeDraft.content);
        } else if (documentWithDraft) {
            setIsDraftMode(false);
            setCurrentContent(documentWithDraft.initialContent);
        }
    }, [activeDraft, documentWithDraft]);

    if (!documentWithDraft) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#FAFBFD]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                    <p className="text-gray-500">Loading document...</p>
                </div>
            </div>
        );
    }

    // Combine document data with draft info
    const documentData = {
        ...documentWithDraft,
        isInDraftMode: isDraftMode,
        hasActiveDraft: !!activeDraft,
        activeDraft,
        title: documentWithDraft.title,
    };

    return (
        <Room>
            <div className="min-h-screen bg-[#FAFBFD]">
                {/* Draft Mode Banner */}
                {isDraftMode && activeDraft && (
                    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 print:hidden">
                        <div className="max-w-7xl mx-auto flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 px-3 py-1 bg-amber-100 border border-amber-300 rounded-full">
                                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                    <span className="text-sm font-medium text-amber-800">
                                        Draft Mode
                                    </span>
                                </div>
                                <div className="text-sm text-amber-700">
                                    {(() => {
                                        const expiresIn = (activeDraft.expiresAt || Date.now() + 24 * 60 * 60 * 1000) - Date.now();
                                        const hoursLeft = Math.floor(expiresIn / (1000 * 60 * 60));
                                        const minutesLeft = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
                                        
                                        if (expiresIn <= 0) return "Draft expired";
                                        if (hoursLeft > 0) return `Expires in ${hoursLeft}h ${minutesLeft}m`;
                                        return `Expires in ${minutesLeft}m`;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main UI */}
                <div className="flex flex-col px-4 pt-2 gap-y-2 fixed top-0 left-0 right-0 z-10 bg-[#FAFBFD] print:hidden">
                    {/* Remove userId from Navbar call */}
                    <Navbar data={documentData} />
                    <Toolbar isDraftMode={isDraftMode} documentId={documentWithDraft._id} />
                </div>
                <div className={`pt-[114px] print:pt-0 ${isDraftMode ? 'pt-[154px]' : ''}`}>
                    <Editor 
                        documentId={documentWithDraft._id} 
                        initialContent={currentContent} 
                        isDraftMode={isDraftMode}
                    />
                </div>
            </div>
        </Room>
    );
};