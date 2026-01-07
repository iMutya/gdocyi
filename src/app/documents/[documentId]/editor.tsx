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
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useDebounce } from 'use-debounce'
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

    // Debounce content updates
    const [debouncedContent] = useDebounce(localContent, 1000);

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

    // Sync debounced content to backend
    useEffect(() => {
        if (debouncedContent !== undefined && 
            debouncedContent !== currentContent && 
            initialLoadDone.current) {
            handleContentUpdate(debouncedContent);
        }
    }, [debouncedContent, currentContent, handleContentUpdate]);

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
        },
        onContentError({ editor }) {
            setEditor(editor);
        },
        editorProps: {
            attributes: {
                style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
                class: cn(
                    "focus:outline-none print:border-0 bg-white border border-[#C7C7C7] flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text",
                    actualIsDraftMode && 'border-l-4 border-l-amber-400'
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
        // Don't render immediately on the server to avoid SSR issues
        // immediatelyRender: false,
    });

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
            {/* Draft Mode Banner */}
            {showDraftBanner && actualIsDraftMode && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
                    <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg shadow-lg">
                        <div className="flex items-center gap-2">
                            <Badge 
                                variant="outline" 
                                className="bg-amber-500 text-white border-amber-600"
                            >
                                <EyeOff className="h-3 w-3 mr-1" />
                                DRAFT
                            </Badge>
                            <div className="text-sm text-amber-800">
                                <span className="font-medium">Editing privately</span>
                                {timeLeft && (
                                    <div className="flex items-center gap-1 text-xs text-amber-600">
                                        <Clock className="h-3 w-3" />
                                        <span>Expires in {timeLeft}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDiscardDraft}
                                disabled={isUpdating}
                                className="h-8 border-gray-300"
                            >
                                <X className="h-3 w-3 mr-1" />
                                Discard
                            </Button>
                            <Button
                                size="sm"
                                onClick={handlePublishDraft}
                                disabled={isUpdating}
                                className="h-8 bg-green-600 hover:bg-green-700"
                            >
                                <Upload className="h-3 w-3 mr-1" />
                                {isUpdating ? 'Publishing...' : 'Publish'}
                            </Button>
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
                <Threads editor={editor}/>
            </div>
        </div>
    );
};