"use client"

import StarterKit from '@tiptap/starter-kit'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'  
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import Image from '@tiptap/extension-image'
import ImageResize from 'tiptap-extension-resize-image';
import Underline from '@tiptap/extension-underline'
import FontFamily from '@tiptap/extension-font-family' 
import TextStyle from '@tiptap/extension-text-style' 
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import { FontSizeExtension } from '@/extensions/font-size'
import { LineHeightExtension } from '@/extensions/line-height'
import { Color } from '@tiptap/extension-color'
import { useEditor, EditorContent } from '@tiptap/react'
import { useEditorStore } from '@/store/use-editor-store'
import { Ruler } from './ruler'
import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { Threads } from './threads'
import { useStorage } from '@liveblocks/react'
import { LEFT_MARGIN_DEFAULT, RIGHT_MARGIN_DEFAULT } from '@/constants/margin'
import { useMutation, useQuery, useConvex } from 'convex/react' // ← Added useConvex
import { api } from '../../../../convex/_generated/api'
import { useEffect, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Id } from '../../../../convex/_generated/dataModel'
import { Loader2, EyeOff, Clock, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface EditorProps {
    documentId: string;
    initialContent?: string | undefined;
    isDraftMode?: boolean;
}

export const Editor = ({ documentId, initialContent, isDraftMode = false }: EditorProps) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [localContent, setLocalContent] = useState<string | undefined>(initialContent);
    const [showDraftBanner, setShowDraftBanner] = useState(isDraftMode);
    const initialLoadDone = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const convexClient = useConvex(); // ← Added convex client
    
    const leftMargin = useStorage((root) => root.leftMargin) ?? LEFT_MARGIN_DEFAULT;
    const rightMargin = useStorage((root) => root.rightMargin) ?? RIGHT_MARGIN_DEFAULT;

    // Get document with draft status
    const documentWithDraft = useQuery(api.documents.getWithDraft, { 
        id: documentId as Id<"documents">
    });
    
    // Also get active draft separately for real-time updates
    const activeDraft = useQuery(api.drafts.getActiveDraft, {
        documentId: documentId as Id<"documents">,
    });

    // ✅ FIXED: Only fetch room info once on mount
    const [roomInfo, setRoomInfo] = useState<any>(null);
    
    useEffect(() => {
        if (!documentId) return;
        
        const fetchRoomInfo = async () => {
            try {
                const result = await convexClient.query(api.documents.getDocumentRoomInfo, {
                    id: documentId as Id<"documents">,
                });
                setRoomInfo(result);
            } catch (error) {
                console.error("Failed to fetch room info:", error);
            }
        };
        
        fetchRoomInfo();
    }, [documentId, convexClient]);
    
    const updateContent = useMutation(api.documents.updateContent);
    const updateDraft = useMutation(api.drafts.updateDraft);
    const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
    const publishDraft = useMutation(api.drafts.publishDraft);
    const discardDraft = useMutation(api.drafts.discardDraft);

    // Determine current content (draft or published)
    const currentContent = activeDraft?.content || 
                         documentWithDraft?.draftContent || 
                         documentWithDraft?.initialContent || 
                         initialContent || "";

    // Determine if we're actually in draft mode
    const actualIsDraftMode = activeDraft?.isActive || 
                             documentWithDraft?.isInDraftMode || 
                             isDraftMode;

    
    // Handle content updates
    const handleContentUpdate = useCallback(async (content: string) => {
        if (!documentId || isUpdating || !initialLoadDone.current) return;

        try {
            setIsUpdating(true);
            
            if (actualIsDraftMode && activeDraft?._id) {
                // Update draft
                await updateDraft({
                    draftId: activeDraft._id,
                    content,
                });
            } else {
                // Try to update main document
                try {
                    await updateContent({
                        id: documentId as Id<"documents">,
                        content,
                    });
                } catch (error: any) {
                    // If error is about being in draft mode, automatically create draft
                    if (error.message?.includes("draft mode") || error.message?.includes("Unauthorized")) {
                        const draftId = await getOrCreateDraft({ 
                            documentId: documentId as Id<"documents"> 
                        });
                        // Update the newly created draft
                        await updateDraft({
                            draftId,
                            content,
                        });
                        setShowDraftBanner(true);
                    } else {
                        throw error;
                    }
                }
            }
        } catch (error) {
            console.error("Error updating content:", error);
        } finally {
            setIsUpdating(false);
        }
    }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating]);

    // ✅ CREATE DEBOUNCED SAVE FUNCTION (3 seconds)
    const debouncedSave = useCallback((content: string) => {
        // Clear any existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        // Set new timeout for 3 seconds after typing stops
        saveTimeoutRef.current = setTimeout(() => {
            if (initialLoadDone.current && !isUpdating && content !== currentContent) {
                handleContentUpdate(content);
            }
        }, 3000); // 3 seconds delay
    }, [handleContentUpdate, isUpdating, currentContent]);

    // ✅ CLEANUP TIMEOUT ON UNMOUNT
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Mark initial load as done
    useEffect(() => {
        if (documentWithDraft !== undefined) {
            setTimeout(() => {
                initialLoadDone.current = true;
            }, 500);
        }
    }, [documentWithDraft]);

    // Initialize Liveblocks extension
    const liveblocks = useLiveblocksExtension({
        initialContent: currentContent,
        offlineSupport_experimental: true,
    });

    const { setEditor } = useEditorStore();

    const editor = useEditor({ 
        autofocus: true,
        immediatelyRender: false,
        onCreate({ editor }) {
            setEditor(editor);
        },
        onDestroy() {
            setEditor(null);
        },
        onUpdate({ editor }) {
            setEditor(editor);
            const content = editor.getHTML();
            setLocalContent(content);
            // ✅ CALL DEBOUNCED SAVE HERE (3-second delay)
            debouncedSave(content);
        },
        onSelectionUpdate({ editor }) {
            setEditor(editor);
        },
        onTransaction({ editor }) {
            setEditor(editor);
        },
        onFocus({ editor }) {
            setEditor(editor);
        },
        onBlur({ editor }) {
            setEditor(editor);
            // ✅ SAVE IMMEDIATELY ON BLUR
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            if (localContent && localContent !== currentContent && initialLoadDone.current) {
                handleContentUpdate(localContent);
            }
        },
        onContentError({ editor }) {
            setEditor(editor);
        },
        editorProps: {
            attributes: {
                style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
                class: cn(
                    "focus:outline-none print:border-0 bg-white border border-[#C7C7C7] flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text",
                    actualIsDraftMode && 'border-l-4 border-l-amber-400',
                    // Read-only styling when another user has a draft
                    // FIX: Use hasOtherUserDraft from documentWithDraft instead of roomInfo
                    (roomInfo?.hasOtherUserDraft && !actualIsDraftMode) && 'bg-gray-50 cursor-not-allowed'
                )
            },
        },
        extensions: [
            StarterKit.configure({
                history: false,
            }),
            TaskItem.configure({
                nested: true,
            }),
            TaskList,
            Table,
            TableCell,
            TableHeader,
            TableRow,
            Image,
            ImageResize,
            Underline,
            FontFamily,
            TextStyle,
            Color,
            Highlight.configure({
                multicolor: true,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                defaultProtocol: "https"
            }),
            TextAlign.configure({
                types: ["heading", "paragraph"]
            }),
            FontSizeExtension,
            LineHeightExtension.configure({
                types: ["heading", "paragraph"],
                defaultLineHeight: "normal"
            }),
            liveblocks,
        ],
        content: currentContent,
    });

    // Disable editor when another user has a draft
    useEffect(() => {
        if (editor && roomInfo?.hasOtherUserDraft && !actualIsDraftMode) {
            // Disable editor when another user has a draft
            editor.setEditable(false);
        } else if (editor) {
            editor.setEditable(true);
        }
    }, [editor, roomInfo?.hasOtherUserDraft, actualIsDraftMode]);

    // Update editor content when switching between draft/published mode
    useEffect(() => {
        if (editor && currentContent !== undefined && editor.getHTML() !== currentContent) {
            editor.commands.setContent(currentContent);
        }
    }, [currentContent, editor]);

    // Calculate time until draft expires
    const getTimeLeft = () => {
        const expiresAt = activeDraft?.expiresAt || documentWithDraft?.draftExpiresAt;
        if (!expiresAt) return null;
        
        const expiresIn = expiresAt - Date.now();
        if (expiresIn <= 0) return "Expired";
        
        const hours = Math.floor(expiresIn / (1000 * 60 * 60));
        const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return "< 1m";
    };

    const handlePublishDraft = async () => {
        if (!activeDraft?._id) return;
        
        try {
            setIsUpdating(true);
            await publishDraft({
                draftId: activeDraft._id,
            });
            setShowDraftBanner(false);
        } catch (error) {
            console.error("Failed to publish draft:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDiscardDraft = async () => {
        if (!activeDraft?._id) return;
        
        try {
            setIsUpdating(true);
            await discardDraft({
                draftId: activeDraft._id,
            });
            setShowDraftBanner(false);
            // Reset editor to published content
            if (editor) {
                editor.commands.setContent(documentWithDraft?.initialContent || "");
            }
        } catch (error) {
            console.error("Failed to discard draft:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    // Show loading state
    if (!documentWithDraft && documentId) {
        return (
            <div className="size-full flex items-center justify-center bg-[#F9FBFD]">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500 mr-2" />
                <div className="text-gray-500">Loading editor...</div>
            </div>
        );
    }

    const timeLeft = getTimeLeft();

    return (
        <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 print:p-0 print:bg-white print:overflow-visible relative">
            {/* Document Locked Banner */}
            {(roomInfo?.hasOtherUserDraft && !actualIsDraftMode) && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                                <Clock className="h-3 w-3 mr-1" />
                                Document Locked
                            </Badge>
                            <div className="text-sm text-blue-800">
                                Another user is editing this document in draft mode. 
                                You can view but not edit until they publish their changes.
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Saving Indicator */}
            {isUpdating && (
                <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg shadow flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving {actualIsDraftMode ? 'draft' : 'changes'}...</span>
                </div>
            )}
            
            <Ruler />
            <div className="min-w-max flex justify-center w-[816px] py-4 print:py-0 mx-auto print:w-full print:min-w-0">
                <EditorContent editor={editor} />
                {/* Only show Threads (comments) when NOT in draft mode */}
                {!actualIsDraftMode && <Threads editor={editor}/>}
            </div>
        </div>
    );
};