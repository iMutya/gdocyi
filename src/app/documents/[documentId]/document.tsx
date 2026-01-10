"use client";

import { Preloaded, usePreloadedQuery } from "convex/react";
import { Editor } from "./editor";
import { Navbar } from "./navbar";
import { Room } from "./room";
import { Toolbar } from "./toolbar";
import { api } from "../../../../convex/_generated/api";
import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "convex/react";
// import { DraftsSidebar } from "@/components/DraftsSidebar";

interface DocumentProps {
    preloadedDocument: Preloaded<typeof api.documents.getWithDraft>;
    userId?: string;
};

export const Document = ({ preloadedDocument, userId }: DocumentProps) => {
    const documentWithDraft = usePreloadedQuery(preloadedDocument);
    
    const activeDraft = useQuery(api.drafts.getActiveDraft, {
        documentId: documentWithDraft?._id,
    });

    // NEW: Get all drafts for the sidebar
    const allDrafts = useQuery(api.drafts.getAllDocumentDrafts, {
        documentId: documentWithDraft?._id,
    });

    // State for draft mode
    const [isDraftMode, setIsDraftMode] = useState(false);
    const [currentContent, setCurrentContent] = useState<string | undefined>();
    // const [showDraftsSidebar, setShowDraftsSidebar] = useState(true);

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
        activeDraft: activeDraft ? {
            expiresAt: activeDraft.expiresAt,
        } : undefined,
        title: documentWithDraft.title,
    };

    return (
        <Room>
            <div className="min-h-screen bg-[#FAFBFD]">
                {/* ONLY show Draft Mode Banner (when user has draft) */}
                

                {/* Main UI with flex container - FIXED LAYOUT */}
                <div className="flex">
                    {/* Main content area - takes remaining space */}
                    <div className="flex-1">
                        {/* Navbar/Toolbar - NOT full width, stops at sidebar */}
                        <div className="sticky top-0 z-10 bg-[#FAFBFD] print:hidden px-4 pt-2">
                            <Navbar data={documentData} />
                            <Toolbar 
                                isDraftMode={isDraftMode} 
                                documentId={documentWithDraft._id} 
                            />
                        </div>
                        
                        <div className={`pt-4 print:pt-0 ${isDraftMode ? 'pt-4' : ''}`}>
                            <Editor 
                                documentId={documentWithDraft._id} 
                                initialContent={currentContent} 
                                isDraftMode={isDraftMode}
                            />
                        </div>
                    </div>

                    {/* Drafts Sidebar - fixed position outside flow */}
                    {/* {showDraftsSidebar && (
                        <div className="fixed right-0 top-[100px] bottom-0 w-80 z-20 border-l border-gray-200 bg-white">
                            <DraftsSidebar documentId={documentWithDraft._id} />
                        </div>
                    )} */}

                    {/* Show toggle button when sidebar is hidden */}
                    {/* {!showDraftsSidebar && (
                        <button
                            onClick={() => setShowDraftsSidebar(true)}
                            className="fixed right-0 top-1/2 transform -translate-y-1/2 bg-gray-800 text-white px-3 py-4 rounded-l-lg shadow-lg hover:bg-gray-900 transition-colors z-30"
                            title="Show drafts sidebar"
                        >
                            <div className="flex flex-col items-center">
                                <span className="text-lg">📋</span>
                                <span className="text-xs mt-1">
                                    {allDrafts && allDrafts.length > 0 ? allDrafts.length : ''}
                                </span>
                            </div>
                        </button>
                    )} */}
                </div>
            </div>
        </Room>
    );
};