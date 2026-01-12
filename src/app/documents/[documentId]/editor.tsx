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
import { Loader2, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface EditorProps {
    documentId: string;
    initialContent?: string | undefined;
    isDraftMode?: boolean;
}

export const Editor = ({ documentId, initialContent, isDraftMode = false }: EditorProps) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [localContent, setLocalContent] = useState<string | undefined>(initialContent);
    const initialLoadDone = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const contentUpdateInProgress = useRef(false);
    const templateContentLoaded = useRef(false);
    const templateContentPreserved = useRef<string | null>(initialContent || null);
    const convexClient = useConvex();
    
    const forceUpdateEditor = useRef(false);
    const discardInProgress = useRef(false);

    const leftMargin = useStorage((root) => root.leftMargin) ?? LEFT_MARGIN_DEFAULT;
    const rightMargin = useStorage((root) => root.rightMargin) ?? RIGHT_MARGIN_DEFAULT;

    const documentWithDraft = useQuery(api.documents.getWithDraft, { 
        id: documentId as Id<"documents">
    });
    const activeDraft = useQuery(api.drafts.getActiveDraft, {
        documentId: documentId as Id<"documents">,
    });

    // const [roomInfo, setRoomInfo] = useState<any>(null);

    const roomInfo = useQuery(api.documents.getDocumentRoomInfo, { 
        id: documentId as Id<"documents"> 
    });
    
    // Mutations
    const updateContent = useMutation(api.documents.updateContent);
    const updateDraft = useMutation(api.drafts.updateDraft);
    const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
    const publishDraft = useMutation(api.drafts.publishDraft);
    const discardDraft = useMutation(api.drafts.discardDraft);

    // --- 1. SEPARATE THE LOGIC ---
    // This is true ONLY if the current user owns the active draft
    const actualIsDraftMode = React.useMemo(() => {
        return !!activeDraft?.isActive;
    }, [activeDraft?.isActive]);

    const shouldLockEditor = React.useMemo(() => {
        const hasOtherUserDraft = roomInfo?.hasOtherUserDraft === true;
        return hasOtherUserDraft && !actualIsDraftMode;
        // Add roomInfo to dependencies so it re-runs when the name updates
    }, [roomInfo, actualIsDraftMode]);

    
    console.log("Banner Debug:", { 
    hasOtherDraft: roomInfo?.hasOtherUserDraft, 
    amIInDraft: actualIsDraftMode, 
    shouldLock: shouldLockEditor 
});

    // const actualIsDraftMode = React.useMemo(() => {
    //     return activeDraft?.isActive || documentWithDraft?.isInDraftMode || isDraftMode;
    // }, [activeDraft?.isActive, documentWithDraft?.isInDraftMode, isDraftMode]);

    // const shouldLockEditor = React.useMemo(() => {
    //     const hasOtherUserDraft = roomInfo?.hasOtherUserDraft === true;
    //     const currentUserHasDraft = roomInfo?.currentUserHasDraft === true;
    //     return hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft;
    // }, [roomInfo?.hasOtherUserDraft, roomInfo?.currentUserHasDraft, actualIsDraftMode]);

    const currentContent = React.useMemo(() => {
        // If we just discarded, the draft is gone from the DB, 
        // but we want to show the published content immediately.
        if (discardInProgress.current) {
            return documentWithDraft?.publishedContent || documentWithDraft?.initialContent || "";
        }

        if (activeDraft?.content) return activeDraft.content;
        
        // If no draft, show published content
        if (documentWithDraft?.publishedContent) return documentWithDraft.publishedContent;
        
        return documentWithDraft?.initialContent || "";
    }, [activeDraft?.content, documentWithDraft, discardInProgress.current]);

    // Source of truth for content
    // const currentContent = React.useMemo(() => {
    //     // If we are currently discarding, ignore the draft and return the published/initial state
    //     if (discardInProgress.current) {
    //         return documentWithDraft?.publishedContent || templateContentPreserved.current || "";
    //     }
    //     if (activeDraft?.content) return activeDraft.content;
    //     if (actualIsDraftMode && documentWithDraft?.draftContent) return documentWithDraft.draftContent;
    //     if (!actualIsDraftMode && documentWithDraft?.publishedContent) return documentWithDraft.publishedContent;
    //     if (documentWithDraft?.initialContent) return documentWithDraft.initialContent;
    //     return templateContentPreserved.current || "";
    // }, [activeDraft?.content, documentWithDraft, actualIsDraftMode]);

    const liveblocks = useLiveblocksExtension({ initialContent, offlineSupport_experimental: true });
    const { setEditor } = useEditorStore();

    const editor = useEditor({
        autofocus: true,
        immediatelyRender: false,
        onCreate({ editor }) { setEditor(editor); },
        onDestroy() { setEditor(null); },
        onUpdate({ editor }) {
            // CRITICAL: Block saving if we are in the middle of discarding
            if (discardInProgress.current) return;

            const content = editor.getHTML();
            setLocalContent(content);
            if (!templateContentLoaded.current && content && content !== '<p></p>') templateContentLoaded.current = true;
            debouncedSave(content);
        },
        editorProps: {
            attributes: {
                style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
                class: cn("focus:outline-none bg-white border flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text", actualIsDraftMode && 'border-l-4 border-l-amber-400', shouldLockEditor && 'bg-gray-50 cursor-not-allowed')
            },
        },
        extensions: [
            StarterKit.configure({ history: false }),
            TaskItem.configure({ nested: true }),
            TaskList, Table, TableCell, TableHeader, TableRow,
            Image, ImageResize, Underline, FontFamily, TextStyle, Color,
            Highlight.configure({ multicolor: true }),
            Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
            TextAlign.configure({ types: ["heading", "paragraph"] }),
            FontSizeExtension,
            LineHeightExtension.configure({ types: ["heading","paragraph"], defaultLineHeight:"normal" }),
            liveblocks,
        ],
        content: "",
    });

     // 1. Add this Ref to track the ID without closure staleness
    const activeDraftIdRef = useRef(activeDraft?._id);
    useEffect(() => {
        activeDraftIdRef.current = activeDraft?._id;
    }, [activeDraft?._id]);

    const handleDiscardDraft = useCallback(async () => {
        if (!activeDraft?._id) return;
        if (!confirm("Discard changes?")) return;

        // 1. Set the flags immediately
        discardInProgress.current = true;
        const deletedId = activeDraft._id;
        activeDraftIdRef.current = undefined;
        ; 
        try {
            setIsUpdating(true);
            const revertTo = documentWithDraft?.publishedContent || documentWithDraft?.initialContent || "";

            // 3. Perform deletion
            await discardDraft({ draftId: deletedId });

            if (editor) {
                editor.commands.setContent(revertTo, false);
            }
            
            setLocalContent(revertTo);
            toast.success("Draft discarded");
        } catch (error) {
            console.error(error);
            discardInProgress.current = false;
            // Restore ID ref if deletion failed
            activeDraftIdRef.current = deletedId;
        } finally {
            setIsUpdating(false);
            setTimeout(() => {
                discardInProgress.current = false;
            }, 1500); // Give it plenty of time to settle
        }
    }, [activeDraft, discardDraft, editor, documentWithDraft]);

   

    const handleContentUpdate = useCallback(async (content: string) => {
        // 1. Initial Guard: Stop if discarding or ID is already gone
        if (discardInProgress.current || !activeDraftIdRef.current) return;

        if (!documentId || isUpdating || !initialLoadDone.current || contentUpdateInProgress.current) return;

        try {
            contentUpdateInProgress.current = true;
            setIsUpdating(true);

            if (actualIsDraftMode) {
                // ✅ FINAL SAFETY CHECK: Take a snapshot of the ID right now
                const currentId = activeDraftIdRef.current;
                
                // If it was wiped by handleDiscardDraft while we were waiting, exit.
                if (!currentId) return; 

                await updateDraft({ 
                    draftId: currentId as Id<"draftDocuments">, 
                    content 
                });
            } else if (!shouldLockEditor) {
                await updateContent({ id: documentId as Id<"documents">, content });
            }
        } catch (error: any) {
            // ✅ THE SILENCER: Catch race conditions gracefully
            const errorMessage = error.message || "";
            if (errorMessage.includes("Draft not found") || discardInProgress.current) {
                console.log("Cleanup: Ignoring ghost save to deleted draft.");
                return; 
            }
            console.error(error);
        } finally {
            setTimeout(() => setIsUpdating(false), 500);
            contentUpdateInProgress.current = false;
        }
    }, [documentId, actualIsDraftMode, shouldLockEditor, updateContent, updateDraft]);

    // const handleContentUpdate = useCallback(async (content: string) => {
    //     if (discardInProgress.current || !activeDraft?._id) return; // EXTRA GUARD
    //     if (!documentId || isUpdating || !initialLoadDone.current) return;
    //     if (contentUpdateInProgress.current) return;

    //     try {
    //         contentUpdateInProgress.current = true;
    //         setIsUpdating(true);

    //         if (actualIsDraftMode && activeDraft?._id) {
    //             await updateDraft({ draftId: activeDraft._id, content });
    //         } else {
    //             try {
    //                 await updateContent({ id: documentId as Id<"documents">, content });
    //             } catch (error: any) {
    //                 if (error.message?.includes("draft mode")) {
    //                     const draftId = await getOrCreateDraft({ documentId: documentId as Id<"documents"> });
    //                     await updateDraft({ draftId, content });
    //                 } else throw error;
    //             }
    //         }
    //     } catch (error) { console.error(error); }
    //     finally { setIsUpdating(false); contentUpdateInProgress.current = false; }
    // }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating]);

    const debouncedSave = useCallback((content: string) => {
        if (discardInProgress.current) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            // Compare with currentContent to avoid saving the same thing
            if (initialLoadDone.current && !isUpdating && content !== currentContent && !discardInProgress.current) {
                handleContentUpdate(content);
            }
        }, 3000);
    }, [handleContentUpdate, isUpdating, currentContent]);

    // Cleanup and Sync Hooks
    useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

    useEffect(() => {
        if (documentWithDraft !== undefined) {
            const timer = setTimeout(() => { initialLoadDone.current = true; }, 800);
            return () => clearTimeout(timer);
        }
    }, [documentWithDraft]);

    useEffect(() => {
        if (!editor) return;
        editor.setEditable(!shouldLockEditor);
    }, [editor, shouldLockEditor]);

    if (!documentWithDraft && documentId) return <div className="p-10 text-center">Loading editor...</div>;

    return (
        <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 print:p-0 print:bg-white print:overflow-visible relative">
            
            {/* ✅ VIEWER MODE: Document Locked (Another user is editing) */}
            {shouldLockEditor && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
                    <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
                                <Clock className="h-3 w-3 mr-1" />
                                Editing in Progress
                            </Badge>
                            <div className="text-sm text-blue-800 font-medium">
                                {/* Dynamic Name Logic */}
                                {roomInfo?.otherEditorName 
                                    ? `${roomInfo.otherEditorName} is currently editing.` 
                                    : "Another user is currently editing."
                                } 
                                <span className="ml-1 opacity-90 font-normal">
                                    You're viewing changes live, but editing is disabled.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ✅ EDITOR MODE: You are the one editing your draft */}
            {actualIsDraftMode && (
                <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
                    <div className="flex items-center gap-3 p-3 bg-white border border-amber-200 rounded-lg shadow-lg">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">
                                <Clock className="h-3 w-3 mr-1" />
                                You're editing
                            </Badge>
                            <div className="text-sm text-amber-900 font-medium">
                                You are currently editing this document in draft mode.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isUpdating && (
                <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg shadow-md flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving changes...</span>
                </div>
            )}

            <Ruler />
            <div className="min-w-max flex justify-center w-[816px] py-4 print:py-0 mx-auto print:w-full print:min-w-0">
                <EditorContent editor={editor} />
                {(actualIsDraftMode || !shouldLockEditor) && <Threads editor={editor} />}
            </div>
        </div>
    );
};


// revert to this if something goes wrong
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
// import { Loader2, Clock, X } from 'lucide-react'
// import { Button } from '@/components/ui/button'
// import { Badge } from '@/components/ui/badge'
// import { toast } from 'sonner'

// interface EditorProps {
//     documentId: string;
//     initialContent?: string | undefined;
//     isDraftMode?: boolean;
// }

// export const Editor = ({ documentId, initialContent, isDraftMode = false }: EditorProps) => {
//     const [isUpdating, setIsUpdating] = useState(false);
//     const [localContent, setLocalContent] = useState<string | undefined>(initialContent);
//     const initialLoadDone = useRef(false);
//     const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
//     const contentUpdateInProgress = useRef(false);
//     const templateContentLoaded = useRef(false);
//     const templateContentPreserved = useRef<string | null>(initialContent || null);
//     const convexClient = useConvex();
    
//     const forceUpdateEditor = useRef(false);
//     const discardInProgress = useRef(false);

//     const leftMargin = useStorage((root) => root.leftMargin) ?? LEFT_MARGIN_DEFAULT;
//     const rightMargin = useStorage((root) => root.rightMargin) ?? RIGHT_MARGIN_DEFAULT;

//     const documentWithDraft = useQuery(api.documents.getWithDraft, { 
//         id: documentId as Id<"documents">
//     });
//     const activeDraft = useQuery(api.drafts.getActiveDraft, {
//         documentId: documentId as Id<"documents">,
//     });

//     const [roomInfo, setRoomInfo] = useState<any>(null);
    
//     // Mutations
//     const updateContent = useMutation(api.documents.updateContent);
//     const updateDraft = useMutation(api.drafts.updateDraft);
//     const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
//     const publishDraft = useMutation(api.drafts.publishDraft);
//     const discardDraft = useMutation(api.drafts.discardDraft);

//     const actualIsDraftMode = React.useMemo(() => {
//         return activeDraft?.isActive || documentWithDraft?.isInDraftMode || isDraftMode;
//     }, [activeDraft?.isActive, documentWithDraft?.isInDraftMode, isDraftMode]);

//     const shouldLockEditor = React.useMemo(() => {
//         const hasOtherUserDraft = roomInfo?.hasOtherUserDraft === true;
//         const currentUserHasDraft = roomInfo?.currentUserHasDraft === true;
//         return hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft;
//     }, [roomInfo?.hasOtherUserDraft, roomInfo?.currentUserHasDraft, actualIsDraftMode]);

//     // Source of truth for content
//     const currentContent = React.useMemo(() => {
//         // If we are currently discarding, ignore the draft and return the published/initial state
//         if (discardInProgress.current) {
//             return documentWithDraft?.publishedContent || templateContentPreserved.current || "";
//         }
//         if (activeDraft?.content) return activeDraft.content;
//         if (actualIsDraftMode && documentWithDraft?.draftContent) return documentWithDraft.draftContent;
//         if (!actualIsDraftMode && documentWithDraft?.publishedContent) return documentWithDraft.publishedContent;
//         if (documentWithDraft?.initialContent) return documentWithDraft.initialContent;
//         return templateContentPreserved.current || "";
//     }, [activeDraft?.content, documentWithDraft, actualIsDraftMode]);

//     const liveblocks = useLiveblocksExtension({ initialContent, offlineSupport_experimental: true });
//     const { setEditor } = useEditorStore();

//     const editor = useEditor({
//         autofocus: true,
//         immediatelyRender: false,
//         onCreate({ editor }) { setEditor(editor); },
//         onDestroy() { setEditor(null); },
//         onUpdate({ editor }) {
//             // CRITICAL: Block saving if we are in the middle of discarding
//             if (discardInProgress.current) return;

//             const content = editor.getHTML();
//             setLocalContent(content);
//             if (!templateContentLoaded.current && content && content !== '<p></p>') templateContentLoaded.current = true;
//             debouncedSave(content);
//         },
//         editorProps: {
//             attributes: {
//                 style: `padding-left: ${leftMargin}px; padding-right: ${rightMargin}px`,
//                 class: cn("focus:outline-none bg-white border flex flex-col min-h-[1054px] w-[816px] pt-10 pr-14 pb-10 cursor-text", actualIsDraftMode && 'border-l-4 border-l-amber-400', shouldLockEditor && 'bg-gray-50 cursor-not-allowed')
//             },
//         },
//         extensions: [
//             StarterKit.configure({ history: false }),
//             TaskItem.configure({ nested: true }),
//             TaskList, Table, TableCell, TableHeader, TableRow,
//             Image, ImageResize, Underline, FontFamily, TextStyle, Color,
//             Highlight.configure({ multicolor: true }),
//             Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
//             TextAlign.configure({ types: ["heading", "paragraph"] }),
//             FontSizeExtension,
//             LineHeightExtension.configure({ types: ["heading","paragraph"], defaultLineHeight:"normal" }),
//             liveblocks,
//         ],
//         content: "",
//     });

//     const handleDiscardDraft = useCallback(async () => {
//         if (!activeDraft?._id) return;
//         if (!confirm("Are you sure you want to discard this draft?")) return;

//         // IMPORTANT: Turn off the flags first
//         discardInProgress.current = true; 
        
//         // Clear any pending debounced saves immediately
//         if (saveTimeoutRef.current) {
//             clearTimeout(saveTimeoutRef.current);
//             saveTimeoutRef.current = null;
//         }

//         try {
//             setIsUpdating(true);

//             // Capture the "Reset" content before we delete the draft
//             const revertTo = documentWithDraft?.publishedContent || templateContentPreserved.current || "";

//             // Delete the draft
//             await discardDraft({ draftId: activeDraft._id });

//             // Force the editor to the old state
//             if (editor) {
//                 editor.commands.setContent(revertTo, false);
//             }

//             setLocalContent(revertTo);
//             toast.success("Draft discarded");
//         } catch (error) {
//             console.error(error);
//             toast.error("Failed to discard draft");
//             discardInProgress.current = false; // Unlock if it failed
//         } finally {
//             setIsUpdating(false);
//             // Wait for Convex to broadcast that activeDraft is null
//             setTimeout(() => {
//                 discardInProgress.current = false;
//             }, 1500); 
//         }
//     }, [activeDraft, discardDraft, editor, documentWithDraft]);

//     // 1. Add this Ref to track the ID without closure staleness
//     const activeDraftIdRef = useRef(activeDraft?._id);
//     useEffect(() => {
//         activeDraftIdRef.current = activeDraft?._id;
//     }, [activeDraft?._id]);

//     const handleContentUpdate = useCallback(async (content: string) => {
//     // 2. Updated Guard: Check the Ref and the discard flag
//     const isGlobalDiscarding = useEditorStore.getState().isDiscarding;
//     if (discardInProgress.current || !activeDraftIdRef.current) return;

//     if (isGlobalDiscarding || discardInProgress.current || !activeDraftIdRef.current) {
//         return; // This stops the "Draft not found" error!
//     }

//     if (!documentId || isUpdating || !initialLoadDone.current || contentUpdateInProgress.current) return;

//     try {
//         contentUpdateInProgress.current = true;
//         setIsUpdating(true);

//         if (actualIsDraftMode && activeDraftIdRef.current) {
//             await updateDraft({ 
//                 draftId: activeDraftIdRef.current as Id<"draftDocuments">, 
//                 content 
//             });
//         } else {
//             await updateContent({ id: documentId as Id<"documents">, content });
//         }
//     } catch (error: any) {
//         // 3. SILENCE THE ERROR: If the draft was just deleted, ignore this specific error
//         if (error.message?.includes("Draft not found")) {
//             return; 
//         }
//         console.error(error);
//     } finally {
//         setIsUpdating(true); // Keep UI in "updating" state briefly to prevent flicker
//         setTimeout(() => setIsUpdating(false), 500);
//         contentUpdateInProgress.current = false;
//     }
// }, [documentId, actualIsDraftMode, updateContent, updateDraft])

//     // const handleContentUpdate = useCallback(async (content: string) => {
//     //     if (discardInProgress.current || !activeDraft?._id) return; // EXTRA GUARD
//     //     if (!documentId || isUpdating || !initialLoadDone.current) return;
//     //     if (contentUpdateInProgress.current) return;

//     //     try {
//     //         contentUpdateInProgress.current = true;
//     //         setIsUpdating(true);

//     //         if (actualIsDraftMode && activeDraft?._id) {
//     //             await updateDraft({ draftId: activeDraft._id, content });
//     //         } else {
//     //             try {
//     //                 await updateContent({ id: documentId as Id<"documents">, content });
//     //             } catch (error: any) {
//     //                 if (error.message?.includes("draft mode")) {
//     //                     const draftId = await getOrCreateDraft({ documentId: documentId as Id<"documents"> });
//     //                     await updateDraft({ draftId, content });
//     //                 } else throw error;
//     //             }
//     //         }
//     //     } catch (error) { console.error(error); }
//     //     finally { setIsUpdating(false); contentUpdateInProgress.current = false; }
//     // }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating]);

//     const debouncedSave = useCallback((content: string) => {
//         if (discardInProgress.current) return;
//         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
//         saveTimeoutRef.current = setTimeout(() => {
//             // Compare with currentContent to avoid saving the same thing
//             if (initialLoadDone.current && !isUpdating && content !== currentContent && !discardInProgress.current) {
//                 handleContentUpdate(content);
//             }
//         }, 3000);
//     }, [handleContentUpdate, isUpdating, currentContent]);

//     // Cleanup and Sync Hooks
//     useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

//     useEffect(() => {
//         if (documentWithDraft !== undefined) {
//             const timer = setTimeout(() => { initialLoadDone.current = true; }, 800);
//             return () => clearTimeout(timer);
//         }
//     }, [documentWithDraft]);

//     useEffect(() => {
//         if (!editor) return;
//         editor.setEditable(!shouldLockEditor);
//     }, [editor, shouldLockEditor]);

//     if (!documentWithDraft && documentId) return <div className="p-10 text-center">Loading editor...</div>;

//     return (
//         <div className="size-full overflow-x-auto bg-[#F9FBFD] px-4 relative">
//             {actualIsDraftMode && !shouldLockEditor && (
//                 <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex gap-2 p-2 bg-white rounded-lg shadow-md border">
//                     <span className="text-sm flex items-center px-2 font-medium text-amber-600">Draft Mode</span>
//                     <Button onClick={handleDiscardDraft} variant="outline" size="sm" disabled={isUpdating}>
//                         Discard
//                     </Button>
//                     <Button 
//                         onClick={async () => activeDraft?._id && await publishDraft({ draftId: activeDraft._id })} 
//                         size="sm" 
//                         disabled={!activeDraft?._id || isUpdating}
//                     >
//                         Publish
//                     </Button>
//                 </div>
//             )}


//             {isUpdating && (
//                 <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg flex items-center gap-2">
//                     <Loader2 className="h-3 w-3 animate-spin" />
//                     <span>Saving...</span>
//                 </div>
//             )}

//             <Ruler />
//             <div className="min-w-max flex justify-center w-[816px] py-4 mx-auto">
//                 <EditorContent editor={editor} />
//                 {!actualIsDraftMode && <Threads editor={editor}/>}
//             </div>
//         </div>
//     );
// };


