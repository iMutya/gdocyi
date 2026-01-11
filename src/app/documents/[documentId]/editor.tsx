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
import { useMutation, useQuery, useConvex } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import React, { useEffect, useState, useCallback, useRef } from 'react'
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
    const contentUpdateInProgress = useRef(false);
    const templateContentLoaded = useRef(false);
    const templateContentPreserved = useRef<string | null>(initialContent || null); // Store template immediately
    const convexClient = useConvex();
    
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
                console.log("📊 Room info fetched:", result);
                setRoomInfo(result);
            } catch (error) {
                console.error("Failed to fetch room info:", error);
            }
        };
        
        fetchRoomInfo();
        
        // Poll every 5 seconds to check for changes
        const interval = setInterval(fetchRoomInfo, 5000);
        return () => clearInterval(interval);
    }, [documentId, convexClient]);
    
    const updateContent = useMutation(api.documents.updateContent);
    const updateDraft = useMutation(api.drafts.updateDraft);
    const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
    const publishDraft = useMutation(api.drafts.publishDraft);
    const discardDraft = useMutation(api.drafts.discardDraft);

    // ✅ FIXED: MUST BE DEFINED BEFORE currentContent!
    // Determine if we're actually in draft mode
    const actualIsDraftMode = React.useMemo(() => {
        return activeDraft?.isActive || 
               documentWithDraft?.isInDraftMode || 
               isDraftMode;
    }, [activeDraft?.isActive, documentWithDraft?.isInDraftMode, isDraftMode]);

    // ✅ FIXED: MUST BE DEFINED BEFORE editor props!
    // Determine if we should lock the editor
    const shouldLockEditor = React.useMemo(() => {
        // Check if another user has a draft AND we're not in draft mode
        const hasOtherUserDraft = roomInfo?.hasOtherUserDraft === true;
        const currentUserHasDraft = roomInfo?.currentUserHasDraft === true;
        
        console.log("🔒 Lock check:", {
            hasOtherUserDraft,
            currentUserHasDraft,
            actualIsDraftMode,
            shouldLock: hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft
        });
        
        return hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft;
    }, [roomInfo?.hasOtherUserDraft, roomInfo?.currentUserHasDraft, actualIsDraftMode]);

    // ✅ NOW currentContent can use actualIsDraftMode
    const currentContent = React.useMemo(() => {
        console.log("Determining content:", {
            hasActiveDraft: !!activeDraft?.content,
            isDraftMode: actualIsDraftMode,
            hasPublishedContent: !!documentWithDraft?.publishedContent,
            hasDraftContent: !!documentWithDraft?.draftContent,
            hasInitialContent: !!documentWithDraft?.initialContent,
            hasTemplate: !!templateContentPreserved.current,
        });
        
        // 1. Active draft content (currently being edited in real-time)
        if (activeDraft?.content) {
            console.log("Using active draft content");
            return activeDraft.content;
        }
        
        // 2. In draft mode - show saved draft content
        if (actualIsDraftMode && documentWithDraft?.draftContent) {
            console.log("Using saved draft content (draft mode)");
            return documentWithDraft.draftContent;
        }
        
        // ✅ 3. NOT in draft mode - show PUBLISHED content (current live version)
        if (!actualIsDraftMode && documentWithDraft?.publishedContent) {
            console.log("Using published content (view mode)");
            return documentWithDraft.publishedContent;
        }
        
        // 4. Template content for NEW documents (only if no other content exists)
        if (templateContentPreserved.current && 
            templateContentPreserved.current.trim() !== '' &&
            !documentWithDraft?.initialContent &&  // Only for brand new docs
            !documentWithDraft?.publishedContent && // No published content
            !documentWithDraft?.draftContent &&    // No draft content
            !activeDraft?.content) {               // No active draft
            console.log("Using template content (new document)");
            return templateContentPreserved.current;
        }
        
        // 5. Fallback to initial content or empty
        console.log("Using initial content fallback");
        return documentWithDraft?.initialContent || initialContent || "";
    }, [
        activeDraft?.content, 
        documentWithDraft?.draftContent, 
        documentWithDraft?.publishedContent,
        documentWithDraft?.initialContent, 
        actualIsDraftMode, // ✅ Now this is defined before!
        initialContent,
        templateContentPreserved.current
    ]);

    // Handle content updates
    const handleContentUpdate = useCallback(async (content: string) => {
        if (!documentId || isUpdating || !initialLoadDone.current) return;
        if (contentUpdateInProgress.current) return;

        try {
            contentUpdateInProgress.current = true;
            setIsUpdating(true);
            
            if (actualIsDraftMode && activeDraft?._id) {
                await updateDraft({
                    draftId: activeDraft._id,
                    content,
                });
            } else {
                try {
                    await updateContent({
                        id: documentId as Id<"documents">,
                        content,
                    });
                } catch (error: any) {
                    if (error.message?.includes("draft mode") || error.message?.includes("Unauthorized")) {
                        const draftId = await getOrCreateDraft({ 
                            documentId: documentId as Id<"documents"> 
                        });
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
            contentUpdateInProgress.current = false;
        }
    }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating]);

    // ✅ CREATE DEBOUNCED SAVE FUNCTION (3 seconds)
    const debouncedSave = useCallback((content: string) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
            if (initialLoadDone.current && !isUpdating && content !== currentContent) {
                handleContentUpdate(content);
            }
        }, 3000);
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
            const timer = setTimeout(() => {
                initialLoadDone.current = true;
                console.log("Initial load done. Template preserved:", !!templateContentPreserved.current);
            }, 800);
            
            return () => clearTimeout(timer);
        }
    }, [documentWithDraft]);

    // Initialize Liveblocks extension
    const liveblocks = useLiveblocksExtension({
        initialContent,
        offlineSupport_experimental: true,
    });

    const { setEditor } = useEditorStore();

    const editor = useEditor({ 
        autofocus: true,
        immediatelyRender: false,
        onCreate({ editor }) {
            setEditor(editor);
            console.log("Editor created with initial template:", !!templateContentPreserved.current);
        },
        onDestroy() {
            setEditor(null);
        },
        onUpdate({ editor }) {
            const content = editor.getHTML();
            setLocalContent(content);
            
            // Mark template as loaded once user starts typing
            if (!templateContentLoaded.current && content && content !== '<p></p>') {
                templateContentLoaded.current = true;
                console.log("Template marked as loaded");
            }
            
            // Save normally
            debouncedSave(content);
        },
        onSelectionUpdate({ editor }) {
            setEditor(editor);
        },
        onFocus({ editor }) {
            setEditor(editor);
        },
        onBlur({ editor }) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            const content = editor.getHTML();
            if (content && content !== currentContent && initialLoadDone.current) {
                handleContentUpdate(content);
            }
        },
        editorProps: {
            attributes: {
                style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
                class: cn(
                    "focus:outline-none print:border-0 bg-white border border-[#C7C7C7] flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text",
                    actualIsDraftMode && 'border-l-4 border-l-amber-400',
                    // Show gray background when locked
                    shouldLockEditor && 'bg-gray-50 cursor-not-allowed'
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
        content: "", // Start empty
    });

    // ✅ MOST IMPORTANT FIX: Load template ONLY ONCE
    useEffect(() => {
        if (!editor || !initialLoadDone.current) return;
        
        const editorContent = editor.getHTML();
        const isEmptyEditor = editorContent === '<p></p>' || 
                            editorContent === '' || 
                            editorContent === '<p><br></p>';
        
        // Check if we have template content to load
        const hasTemplateContent = templateContentPreserved.current && 
                                 templateContentPreserved.current.trim() !== '';
        
        console.log("Template load check:", {
            isEmptyEditor,
            hasTemplateContent,
            editorContent,
            templateContent: templateContentPreserved.current?.substring(0, 50)
        });
        
        // Load template content if editor is empty and we have template
        if (isEmptyEditor && hasTemplateContent && !templateContentLoaded.current) {
            console.log("Loading template into editor");
            // Use a small delay to ensure editor is ready
            setTimeout(() => {
                if (editor && !contentUpdateInProgress.current) {
                    editor.commands.setContent(templateContentPreserved.current, false);
                    templateContentLoaded.current = true;
                }
            }, 100);
        }
    }, [editor, initialLoadDone.current]);

    // ✅ UPDATE EDITOR WITH currentContent (when not using template)
    useEffect(() => {
        if (!editor || !initialLoadDone.current || templateContentLoaded.current) return;
        
        const editorContent = editor.getHTML();
        const isEmptyEditor = editorContent === '<p></p>' || 
                            editorContent === '' || 
                            editorContent === '<p><br></p>';
        
        // Only update if editor is empty OR content is different
        if (isEmptyEditor || editorContent !== currentContent) {
            console.log("Updating editor with currentContent:", {
                editorEmpty: isEmptyEditor,
                contentDifferent: editorContent !== currentContent,
                templateLoaded: templateContentLoaded.current,
            });
            editor.commands.setContent(currentContent, false);
        }
    }, [currentContent, editor, initialLoadDone.current]);

    // ✅ FIXED: Disable editor when another user has a draft
    useEffect(() => {
        if (!editor) return;
        
        console.log("🔒 Setting editor editable:", !shouldLockEditor);
        
        if (shouldLockEditor) {
            console.log("🔒 LOCKING EDITOR - Another user has a draft");
            editor.setEditable(false);
            editor.commands.blur();
            
            // Add visual feedback
            const editorElement = editor.view.dom;
            editorElement.style.cursor = 'not-allowed';
        } else {
            console.log("🔓 UNLOCKING EDITOR");
            editor.setEditable(true);
            
            // Remove visual feedback
            const editorElement = editor.view.dom;
            editorElement.style.cursor = '';
        }
    }, [editor, shouldLockEditor]);

    // Show loading state
    if (!documentWithDraft && documentId) {
        return (
            <div className="size-full flex items-center justify-center bg-[#F9FBFD]">
                <Loader2 className="h-8 w-8 animate-spin text-gray-500 mr-2" />
                <div className="text-gray-500">Loading editor...</div>
            </div>
        );
    }

    return (
        <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 print:p-0 print:bg-white print:overflow-visible relative">
            {/* ✅ FIXED: Document Locked Banner */}
            {shouldLockEditor && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
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
                        {/* Debug info
                        {process.env.NODE_ENV === 'development' && (
                            <div className="text-xs text-blue-600 ml-4">
                                hasOtherUserDraft: {roomInfo?.hasOtherUserDraft?.toString()}
                            </div>
                        )} */}
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
            
            {/* Debug Panel
            {process.env.NODE_ENV === 'development' && (
                <div className="fixed bottom-4 left-4 z-50 p-3 bg-gray-900 text-white text-xs rounded shadow-lg max-w-xs">
                    <div className="font-bold mb-1">🔒 Lock Debug:</div>
                    <pre className="whitespace-pre-wrap break-words text-[10px]">
                        {JSON.stringify({
                            shouldLockEditor,
                            hasOtherUserDraft: roomInfo?.hasOtherUserDraft,
                            currentUserHasDraft: roomInfo?.currentUserHasDraft,
                            actualIsDraftMode,
                            editorEditable: editor?.isEditable,
                            roomInfo,
                        }, null, 2)}
                    </pre>
                </div>
            )}
             */}
            <Ruler />
            <div className="min-w-max flex justify-center w-[816px] py-4 print:py-0 mx-auto print:w-full print:min-w-0">
                <EditorContent editor={editor} />
                {!actualIsDraftMode && <Threads editor={editor}/>}
            </div>
        </div>
    );
};


// "use client"

// import StarterKit from '@tiptap/starter-kit'
// import TaskItem from '@tiptap/extension-task-item'
// import TaskList from '@tiptap/extension-task-list'
// import Table from '@tiptap/extension-table'
// import TableCell from '@tiptap/extension-table-cell'  
// import TableHeader from '@tiptap/extension-table-header'
// import TableRow from '@tiptap/extension-table-row'
// import Image from '@tiptap/extension-image'
// import ImageResize from 'tiptap-extension-resize-image';
// import Underline from '@tiptap/extension-underline'
// import FontFamily from '@tiptap/extension-font-family' 
// import TextStyle from '@tiptap/extension-text-style' 
// import Highlight from '@tiptap/extension-highlight'
// import Link from '@tiptap/extension-link'
// import TextAlign from '@tiptap/extension-text-align'
// import { FontSizeExtension } from '@/extensions/font-size'
// import { LineHeightExtension } from '@/extensions/line-height'
// import { Color } from '@tiptap/extension-color'
// import { useEditor, EditorContent } from '@tiptap/react'
// import { useEditorStore } from '@/store/use-editor-store'
// import { Ruler } from './ruler'
// import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
// import { Threads } from './threads'
// import { useStorage } from '@liveblocks/react'
// import { LEFT_MARGIN_DEFAULT, RIGHT_MARGIN_DEFAULT } from '@/constants/margin'
// import { useMutation, useQuery, useConvex } from 'convex/react'
// import { api } from '../../../../convex/_generated/api'
// import React, { useEffect, useState, useCallback, useRef } from 'react'
// import { cn } from '@/lib/utils'
// import { Id } from '../../../../convex/_generated/dataModel'
// import { Loader2, EyeOff, Clock, Upload, X } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { Badge } from '@/components/ui/badge'

// interface EditorProps {
//     documentId: string;
//     initialContent?: string | undefined;
//     isDraftMode?: boolean;
// }

// export const Editor = ({ documentId, initialContent, isDraftMode = false }: EditorProps) => {
//     const [isUpdating, setIsUpdating] = useState(false);
//     const [localContent, setLocalContent] = useState<string | undefined>(initialContent);
//     const [showDraftBanner, setShowDraftBanner] = useState(isDraftMode);
//     const initialLoadDone = useRef(false);
//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const contentUpdateInProgress = useRef(false);
//     const templateContentLoaded = useRef(false);
//     const templateContentPreserved = useRef<string | null>(initialContent || null); // Store template immediately
//     const convexClient = useConvex();
    
//     const leftMargin = useStorage((root) => root.leftMargin) ?? LEFT_MARGIN_DEFAULT;
//     const rightMargin = useStorage((root) => root.rightMargin) ?? RIGHT_MARGIN_DEFAULT;

//     // Get document with draft status
//     const documentWithDraft = useQuery(api.documents.getWithDraft, { 
//         id: documentId as Id<"documents">
//     });
    
//     // Also get active draft separately for real-time updates
//     const activeDraft = useQuery(api.drafts.getActiveDraft, {
//         documentId: documentId as Id<"documents">,
//     });

//     // ✅ FIXED: Only fetch room info once on mount
//     const [roomInfo, setRoomInfo] = useState<any>(null);
    
//     useEffect(() => {
//         if (!documentId) return;
        
//         const fetchRoomInfo = async () => {
//             try {
//                 const result = await convexClient.query(api.documents.getDocumentRoomInfo, {
//                     id: documentId as Id<"documents">,
//                 });
//                 setRoomInfo(result);
//             } catch (error) {
//                 console.error("Failed to fetch room info:", error);
//             }
//         };
        
//         fetchRoomInfo();
//     }, [documentId, convexClient]);
    
//     const updateContent = useMutation(api.documents.updateContent);
//     const updateDraft = useMutation(api.drafts.updateDraft);
//     const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
//     const publishDraft = useMutation(api.drafts.publishDraft);
//     const discardDraft = useMutation(api.drafts.discardDraft);

//     // ✅ FIXED: MUST BE DEFINED BEFORE currentContent!
//     // Determine if we're actually in draft mode
//     const actualIsDraftMode = React.useMemo(() => {
//         return activeDraft?.isActive || 
//                documentWithDraft?.isInDraftMode || 
//                isDraftMode;
//     }, [activeDraft?.isActive, documentWithDraft?.isInDraftMode, isDraftMode]);

//     // ✅ NOW currentContent can use actualIsDraftMode
//     const currentContent = React.useMemo(() => {
//         console.log("Determining content:", {
//             hasActiveDraft: !!activeDraft?.content,
//             isDraftMode: actualIsDraftMode,
//             hasPublishedContent: !!documentWithDraft?.publishedContent,
//             hasDraftContent: !!documentWithDraft?.draftContent,
//             hasInitialContent: !!documentWithDraft?.initialContent,
//             hasTemplate: !!templateContentPreserved.current,
//         });
        
//         // 1. Active draft content (currently being edited in real-time)
//         if (activeDraft?.content) {
//             console.log("Using active draft content");
//             return activeDraft.content;
//         }
        
//         // 2. In draft mode - show saved draft content
//         if (actualIsDraftMode && documentWithDraft?.draftContent) {
//             console.log("Using saved draft content (draft mode)");
//             return documentWithDraft.draftContent;
//         }
        
//         // ✅ 3. NOT in draft mode - show PUBLISHED content (current live version)
//         if (!actualIsDraftMode && documentWithDraft?.publishedContent) {
//             console.log("Using published content (view mode)");
//             return documentWithDraft.publishedContent;
//         }
        
//         // 4. Template content for NEW documents (only if no other content exists)
//         if (templateContentPreserved.current && 
//             templateContentPreserved.current.trim() !== '' &&
//             !documentWithDraft?.initialContent &&  // Only for brand new docs
//             !documentWithDraft?.publishedContent && // No published content
//             !documentWithDraft?.draftContent &&    // No draft content
//             !activeDraft?.content) {               // No active draft
//             console.log("Using template content (new document)");
//             return templateContentPreserved.current;
//         }
        
//         // 5. Fallback to initial content or empty
//         console.log("Using initial content fallback");
//         return documentWithDraft?.initialContent || initialContent || "";
//     }, [
//         activeDraft?.content, 
//         documentWithDraft?.draftContent, 
//         documentWithDraft?.publishedContent,
//         documentWithDraft?.initialContent, 
//         actualIsDraftMode, // ✅ Now this is defined before!
//         initialContent,
//         templateContentPreserved.current
//     ]);

//     // Handle content updates
//     const handleContentUpdate = useCallback(async (content: string) => {
//         if (!documentId || isUpdating || !initialLoadDone.current) return;
//         if (contentUpdateInProgress.current) return;

//         try {
//             contentUpdateInProgress.current = true;
//             setIsUpdating(true);
            
//             if (actualIsDraftMode && activeDraft?._id) {
//                 await updateDraft({
//                     draftId: activeDraft._id,
//                     content,
//                 });
//             } else {
//                 try {
//                     await updateContent({
//                         id: documentId as Id<"documents">,
//                         content,
//                     });
//                 } catch (error: any) {
//                     if (error.message?.includes("draft mode") || error.message?.includes("Unauthorized")) {
//                         const draftId = await getOrCreateDraft({ 
//                             documentId: documentId as Id<"documents"> 
//                         });
//                         await updateDraft({
//                             draftId,
//                             content,
//                         });
//                         setShowDraftBanner(true);
//                     } else {
//                         throw error;
//                     }
//                 }
//             }
//         } catch (error) {
//             console.error("Error updating content:", error);
//         } finally {
//             setIsUpdating(false);
//             contentUpdateInProgress.current = false;
//         }
//     }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating]);

//     // ✅ CREATE DEBOUNCED SAVE FUNCTION (3 seconds)
//     const debouncedSave = useCallback((content: string) => {
//         if (saveTimeoutRef.current) {
//             clearTimeout(saveTimeoutRef.current);
//         }
        
//         saveTimeoutRef.current = setTimeout(() => {
//             if (initialLoadDone.current && !isUpdating && content !== currentContent) {
//                 handleContentUpdate(content);
//             }
//         }, 3000);
//     }, [handleContentUpdate, isUpdating, currentContent]);

//     // ✅ CLEANUP TIMEOUT ON UNMOUNT
//     useEffect(() => {
//         return () => {
//             if (saveTimeoutRef.current) {
//                 clearTimeout(saveTimeoutRef.current);
//             }
//         };
//     }, []);

//     // Mark initial load as done
//     useEffect(() => {
//         if (documentWithDraft !== undefined) {
//             const timer = setTimeout(() => {
//                 initialLoadDone.current = true;
//                 console.log("Initial load done. Template preserved:", !!templateContentPreserved.current);
//             }, 800);
            
//             return () => clearTimeout(timer);
//         }
//     }, [documentWithDraft]);

//     // Initialize Liveblocks extension
//     const liveblocks = useLiveblocksExtension({
//         initialContent,
//         offlineSupport_experimental: true,
//     });

//     const { setEditor } = useEditorStore();

//     const editor = useEditor({ 
//         autofocus: true,
//         immediatelyRender: false,
//         onCreate({ editor }) {
//             setEditor(editor);
//             console.log("Editor created with initial template:", !!templateContentPreserved.current);
//         },
//         onDestroy() {
//             setEditor(null);
//         },
//         onUpdate({ editor }) {
//             const content = editor.getHTML();
//             setLocalContent(content);
            
//             // Mark template as loaded once user starts typing
//             if (!templateContentLoaded.current && content && content !== '<p></p>') {
//                 templateContentLoaded.current = true;
//                 console.log("Template marked as loaded");
//             }
            
//             // Save normally
//             debouncedSave(content);
//         },
//         onSelectionUpdate({ editor }) {
//             setEditor(editor);
//         },
//         onFocus({ editor }) {
//             setEditor(editor);
//         },
//         onBlur({ editor }) {
//             if (saveTimeoutRef.current) {
//                 clearTimeout(saveTimeoutRef.current);
//             }
//             const content = editor.getHTML();
//             if (content && content !== currentContent && initialLoadDone.current) {
//                 handleContentUpdate(content);
//             }
//         },
//         editorProps: {
//             attributes: {
//                 style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
//                 class: cn(
//                     "focus:outline-none print:border-0 bg-white border border-[#C7C7C7] flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text",
//                     actualIsDraftMode && 'border-l-4 border-l-amber-400',
//                     (roomInfo?.hasOtherUserDraft && !actualIsDraftMode) && 'bg-gray-50 cursor-not-allowed'
//                 )
//             },
//         },
//         extensions: [
//             StarterKit.configure({
//                 history: false,
//             }),
//             TaskItem.configure({
//                 nested: true,
//             }),
//             TaskList,
//             Table,
//             TableCell,
//             TableHeader,
//             TableRow,
//             Image,
//             ImageResize,
//             Underline,
//             FontFamily,
//             TextStyle,
//             Color,
//             Highlight.configure({
//                 multicolor: true,
//             }),
//             Link.configure({
//                 openOnClick: false,
//                 autolink: true,
//                 defaultProtocol: "https"
//             }),
//             TextAlign.configure({
//                 types: ["heading", "paragraph"]
//             }),
//             FontSizeExtension,
//             LineHeightExtension.configure({
//                 types: ["heading", "paragraph"],
//                 defaultLineHeight: "normal"
//             }),
//             liveblocks,
//         ],
//         content: "", // Start empty
//     });

//     // ✅ MOST IMPORTANT FIX: Load template ONLY ONCE
//     useEffect(() => {
//         if (!editor || !initialLoadDone.current) return;
        
//         const editorContent = editor.getHTML();
//         const isEmptyEditor = editorContent === '<p></p>' || 
//                             editorContent === '' || 
//                             editorContent === '<p><br></p>';
        
//         // Check if we have template content to load
//         const hasTemplateContent = templateContentPreserved.current && 
//                                  templateContentPreserved.current.trim() !== '';
        
//         console.log("Template load check:", {
//             isEmptyEditor,
//             hasTemplateContent,
//             editorContent,
//             templateContent: templateContentPreserved.current?.substring(0, 50)
//         });
        
//         // Load template content if editor is empty and we have template
//         if (isEmptyEditor && hasTemplateContent && !templateContentLoaded.current) {
//             console.log("Loading template into editor");
//             // Use a small delay to ensure editor is ready
//             setTimeout(() => {
//                 if (editor && !contentUpdateInProgress.current) {
//                     editor.commands.setContent(templateContentPreserved.current, false);
//                     templateContentLoaded.current = true;
//                 }
//             }, 100);
//         }
//     }, [editor, initialLoadDone.current]);

//     // ✅ UPDATE EDITOR WITH currentContent (when not using template)
//     useEffect(() => {
//         if (!editor || !initialLoadDone.current || templateContentLoaded.current) return;
        
//         const editorContent = editor.getHTML();
//         const isEmptyEditor = editorContent === '<p></p>' || 
//                             editorContent === '' || 
//                             editorContent === '<p><br></p>';
        
//         // Only update if editor is empty OR content is different
//         if (isEmptyEditor || editorContent !== currentContent) {
//             console.log("Updating editor with currentContent:", {
//                 editorEmpty: isEmptyEditor,
//                 contentDifferent: editorContent !== currentContent,
//                 templateLoaded: templateContentLoaded.current,
//             });
//             editor.commands.setContent(currentContent, false);
//         }
//     }, [currentContent, editor, initialLoadDone.current]);

//     // Disable editor when another user has a draft
//     useEffect(() => {
//         if (editor && roomInfo?.hasOtherUserDraft && !actualIsDraftMode) {
//             editor.setEditable(false);
//         } else if (editor) {
//             editor.setEditable(true);
//         }
//     }, [editor, roomInfo?.hasOtherUserDraft, actualIsDraftMode]);

//     // Show loading state
//     if (!documentWithDraft && documentId) {
//         return (
//             <div className="size-full flex items-center justify-center bg-[#F9FBFD]">
//                 <Loader2 className="h-8 w-8 animate-spin text-gray-500 mr-2" />
//                 <div className="text-gray-500">Loading editor...</div>
//             </div>
//         );
//     }

//     return (
//         <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 print:p-0 print:bg-white print:overflow-visible relative">
//             {/* Document Locked Banner */}
//             {(roomInfo?.hasOtherUserDraft && !actualIsDraftMode) && (
//                 <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
//                     <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
//                         <div className="flex items-center gap-2">
//                             <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
//                                 <Clock className="h-3 w-3 mr-1" />
//                                 Document Locked
//                             </Badge>
//                             <div className="text-sm text-blue-800">
//                                 Another user is editing this document in draft mode. 
//                                 You can view but not edit until they publish their changes.
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             )}
            
//             {/* Saving Indicator */}
//             {isUpdating && (
//                 <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg shadow flex items-center gap-2">
//                     <Loader2 className="h-3 w-3 animate-spin" />
//                     <span>Saving {actualIsDraftMode ? 'draft' : 'changes'}...</span>
//                 </div>
//             )}
            
//             <Ruler />
//             <div className="min-w-max flex justify-center w-[816px] py-4 print:py-0 mx-auto print:w-full print:min-w-0">
//                 <EditorContent editor={editor} />
//                 {!actualIsDraftMode && <Threads editor={editor}/>}
//             </div>
//         </div>
//     );
// };
