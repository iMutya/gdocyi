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

interface DocumentProps {
    preloadedDocument: Preloaded<typeof api.documents.getWithDraft>;
    userId?: string;
};

export const Document = ({ preloadedDocument, userId }: DocumentProps) => {
    const documentWithDraft = usePreloadedQuery(preloadedDocument);
    
    const activeDraft = useQuery(api.drafts.getActiveDraft, {
        documentId: documentWithDraft?._id,
    });

    
    const [isDraftMode, setIsDraftMode] = useState(false);
    const [currentContent, setCurrentContent] = useState<string | undefined>();

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
                <div className="flex">
                    <div className="flex-1">
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
                </div>
            </div>
        </Room>
    );
};