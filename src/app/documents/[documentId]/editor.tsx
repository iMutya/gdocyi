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




// fallback
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
// import { toast } from 'sonner'

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
//     const templateContentPreserved = useRef<string | null>(initialContent || null);
//     const convexClient = useConvex();
    
//     // ✅ ADD THIS: Force editor update after discard
//     const forceUpdateEditor = useRef(false);
//     const discardInProgress = useRef(false); // NEW: Track discard operation
    
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
//                 console.log("📊 Room info fetched:", result);
//                 setRoomInfo(result);
//             } catch (error) {
//                 console.error("Failed to fetch room info:", error);
//             }
//         };
        
//         fetchRoomInfo();
        
//         // Poll every 5 seconds to check for changes
//         const interval = setInterval(fetchRoomInfo, 5000);
//         return () => clearInterval(interval);
//     }, [documentId, convexClient]);
    
//     const updateContent = useMutation(api.documents.updateContent);
//     const updateDraft = useMutation(api.drafts.updateDraft);
//     const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
//     const publishDraft = useMutation(api.drafts.publishDraft);
//     const discardDraft = useMutation(api.drafts.discardDraft);

//     // ✅ FIXED: MUST BE DEFINED BEFORE currentContent!
//     // Determine if we're actually in draft mode
//     const actualIsDraftMode = React.useMemo(() => {
//         const isDraft = activeDraft?.isActive || 
//                        documentWithDraft?.isInDraftMode || 
//                        isDraftMode;
        
//         console.log("🎭 actualIsDraftMode check:", {
//             activeDraftIsActive: activeDraft?.isActive,
//             documentIsInDraftMode: documentWithDraft?.isInDraftMode,
//             isDraftMode,
//             result: isDraft
//         });
        
//         return isDraft;
//     }, [activeDraft?.isActive, documentWithDraft?.isInDraftMode, isDraftMode]);

//     // ✅ FIXED: MUST BE DEFINED BEFORE editor props!
//     // Determine if we should lock the editor
//     const shouldLockEditor = React.useMemo(() => {
//         // Check if another user has a draft AND we're not in draft mode
//         const hasOtherUserDraft = roomInfo?.hasOtherUserDraft === true;
//         const currentUserHasDraft = roomInfo?.currentUserHasDraft === true;
        
//         console.log("🔒 Lock check:", {
//             hasOtherUserDraft,
//             currentUserHasDraft,
//             actualIsDraftMode,
//             shouldLock: hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft
//         });
        
//         return hasOtherUserDraft && !actualIsDraftMode && !currentUserHasDraft;
//     }, [roomInfo?.hasOtherUserDraft, roomInfo?.currentUserHasDraft, actualIsDraftMode]);

//     // ✅ FIXED: Improved currentContent logic - DECLARE THIS BEFORE handleDiscardDraft
//     const currentContent = React.useMemo(() => {
//         console.log("📄 Determining content:", {
//             hasActiveDraft: !!activeDraft?.content,
//             activeDraftId: activeDraft?._id,
//             isDraftMode: actualIsDraftMode,
//             hasPublishedContent: !!documentWithDraft?.publishedContent,
//             hasDraftContent: !!documentWithDraft?.draftContent,
//             hasInitialContent: !!documentWithDraft?.initialContent,
//             hasTemplate: !!templateContentPreserved.current,
//             forceUpdate: forceUpdateEditor.current,
//             discardInProgress: discardInProgress.current,
//         });
        
//         // IMPORTANT: If discard is in progress, we should NOT show draft content
//         // This prevents the editor from loading the draft content before the query updates
        
//         // 1. Active draft content (currently being edited in real-time)
//         // Skip if discard is in progress
//         if (!discardInProgress.current && activeDraft?.content) {
//             console.log("📄 Using active draft content");
//             return activeDraft.content;
//         }
        
//         // 2. In draft mode - show saved draft content
//         // Skip if discard is in progress
//         if (!discardInProgress.current && actualIsDraftMode && documentWithDraft?.draftContent) {
//             console.log("📄 Using saved draft content (draft mode)");
//             return documentWithDraft.draftContent;
//         }
        
//         // ✅ 3. NOT in draft mode - show PUBLISHED content (current live version)
//         if (!actualIsDraftMode && documentWithDraft?.publishedContent) {
//             console.log("📄 Using published content (view mode)");
//             return documentWithDraft.publishedContent;
//         }
        
//         // ✅ 4. If we just discarded and have no published content, show initial content
//         if (documentWithDraft?.initialContent) {
//             console.log("📄 Using initial content (no draft, no published)");
//             return documentWithDraft.initialContent;
//         }
        
//         // 5. Template content for NEW documents (only if no other content exists)
//         if (templateContentPreserved.current && 
//             templateContentPreserved.current.trim() !== '' &&
//             !documentWithDraft?.initialContent &&  // Only for brand new docs
//             !documentWithDraft?.publishedContent && // No published content
//             !documentWithDraft?.draftContent &&    // No draft content
//             !activeDraft?.content) {               // No active draft
//             console.log("📄 Using template content (new document)");
//             return templateContentPreserved.current;
//         }
        
//         // 6. Fallback to empty
//         console.log("📄 Using empty content fallback");
//         return "";
//     }, [
//         activeDraft?.content, 
//         activeDraft?._id,
//         documentWithDraft?.draftContent, 
//         documentWithDraft?.publishedContent,
//         documentWithDraft?.initialContent, 
//         actualIsDraftMode,
//         initialContent,
//         templateContentPreserved.current,
//         forceUpdateEditor.current,
//         discardInProgress.current // Add this dependency
//     ]);

//     // ✅ FIXED: Now handleDiscardDraft can use currentContent since it's declared above
//     const handleDiscardDraft = useCallback(async () => {
//         if (!activeDraft?._id) return;
        
//         if (!confirm("Are you sure you want to discard this draft? All changes will be lost.")) {
//             return;
//         }
        
//         try {
//             console.log("🗑️ Discarding draft from Editor component:", activeDraft._id);
//             setIsUpdating(true);
//             discardInProgress.current = true; // NEW: Mark discard in progress
            
//             // Clear any pending saves
//             if (saveTimeoutRef.current) {
//                 clearTimeout(saveTimeoutRef.current);
//                 saveTimeoutRef.current = null;
//             }
            
//             // Log state before discard
//             console.log("📝 State before discard:", {
//                 hasActiveDraft: !!activeDraft,
//                 activeDraftId: activeDraft._id,
//                 currentContent: currentContent?.substring(0, 100),
//                 forceUpdate: forceUpdateEditor.current,
//                 templateLoaded: templateContentLoaded.current,
//             });
            
//             // Delete the draft
//             const result = await discardDraft({ draftId: activeDraft._id });
//             console.log("✅ Discard result:", result);
            
//             // ✅ Force editor to update content
//             forceUpdateEditor.current = true;
//             templateContentLoaded.current = false; // Reset template flag
            
//             // Clear local content state
//             setLocalContent(undefined);
            
//             toast.success("Draft discarded");
            
//             // Log state after discard
//             console.log("📝 State after discard:", {
//                 forceUpdate: forceUpdateEditor.current,
//                 templateLoaded: templateContentLoaded.current,
//             });
            
//         } catch (error) {
//             console.error("❌ Failed to discard draft:", error);
//             toast.error("Failed to discard draft");
//         } finally {
//             setIsUpdating(false);
//             // Don't reset discardInProgress immediately - let effects handle it
//         }
//     }, [activeDraft?._id, discardDraft, currentContent]);

//     // Handle content updates
//     const handleContentUpdate = useCallback(async (content: string) => {
//         // Don't save if discard is in progress
//         if (discardInProgress.current) {
//             console.log("⏸️ Skipping save - discard in progress");
//             return;
//         }
        
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
//     }, [documentId, actualIsDraftMode, activeDraft, updateContent, updateDraft, getOrCreateDraft, isUpdating, discardInProgress]);

//     // ✅ FIXED: Improved debounced save function
//     const debouncedSave = useCallback((content: string) => {
//         // Don't schedule saves if discard is in progress
//         if (discardInProgress.current) {
//             console.log("⏸️ Skipping debounced save - discard in progress");
//             return;
//         }
        
//         if (saveTimeoutRef.current) {
//             clearTimeout(saveTimeoutRef.current);
//         }
        
//         saveTimeoutRef.current = setTimeout(() => {
//             if (initialLoadDone.current && !isUpdating && content !== currentContent && !discardInProgress.current) {
//                 handleContentUpdate(content);
//             }
//         }, 3000);
//     }, [handleContentUpdate, isUpdating, currentContent, discardInProgress]);

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

//     // ✅ FIXED: Reset discardInProgress flag when queries update
//     useEffect(() => {
//         // When activeDraft becomes null after discard, reset the flag
//         if (discardInProgress.current && !activeDraft) {
//             console.log("✅ Discard complete - activeDraft is now null");
//             discardInProgress.current = false;
//         }
//     }, [activeDraft]);

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
            
//             // Don't mark template as loaded or save if discard is in progress
//             if (discardInProgress.current) {
//                 console.log("⏸️ Skipping onUpdate - discard in progress");
//                 return;
//             }
            
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
            
//             // Don't save if discard is in progress
//             if (discardInProgress.current) {
//                 console.log("⏸️ Skipping onBlur save - discard in progress");
//                 return;
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
//                     // Show gray background when locked
//                     shouldLockEditor && 'bg-gray-50 cursor-not-allowed'
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

//     // ✅ FIXED: Moved these effects AFTER editor declaration
//     // ✅ UPDATE: Load template ONLY ONCE (updated)
//     useEffect(() => {
//         if (!editor || !initialLoadDone.current) return;
        
//         const editorContent = editor.getHTML();
//         const isEmptyEditor = editorContent === '<p></p>' || 
//                             editorContent === '' || 
//                             editorContent === '<p><br></p>';
        
//         // Check if we have template content to load
//         const hasTemplateContent = templateContentPreserved.current && 
//                                  templateContentPreserved.current.trim() !== '';
        
//         console.log("🔧 Template load check:", {
//             isEmptyEditor,
//             hasTemplateContent,
//             templateLoaded: templateContentLoaded.current,
//             forceUpdate: forceUpdateEditor.current,
//             discardInProgress: discardInProgress.current,
//             editorContentLength: editorContent?.length,
//         });
        
//         // Load template content if:
//         // 1. Editor is empty AND
//         // 2. We have template content AND
//         // 3. Template hasn't been loaded yet AND
//         // 4. Force update is not requested AND
//         // 5. Discard is not in progress
//         if (isEmptyEditor && hasTemplateContent && !templateContentLoaded.current && !forceUpdateEditor.current && !discardInProgress.current) {
//             console.log("🔧 Loading template into editor");
//             // Use a small delay to ensure editor is ready
//             setTimeout(() => {
//                 if (editor && !contentUpdateInProgress.current) {
//                     editor.commands.setContent(templateContentPreserved.current, false);
//                     templateContentLoaded.current = true;
//                 }
//             }, 100);
//         }
//     }, [editor, initialLoadDone.current]);

//     // ✅ UPDATE EDITOR WITH currentContent (with force update support)
//     useEffect(() => {
//         if (!editor || !initialLoadDone.current) return;
        
//         const editorContent = editor.getHTML();
//         const isEmptyEditor = editorContent === '<p></p>' || 
//                             editorContent === '' || 
//                             editorContent === '<p><br></p>';
        
//         console.log("🔄 Editor update check:", {
//             hasEditor: !!editor,
//             initialLoadDone: initialLoadDone.current,
//             templateLoaded: templateContentLoaded.current,
//             forceUpdate: forceUpdateEditor.current,
//             discardInProgress: discardInProgress.current,
//             isEmptyEditor,
//             contentDifferent: editorContent !== currentContent,
//             editorContentLength: editorContent?.length,
//             currentContentLength: currentContent?.length,
//         });
        
//         // Check if we should update:
//         // 1. Force update is requested
//         // 2. Template not loaded AND (editor is empty OR content is different) AND discard not in progress
//         const shouldUpdate = forceUpdateEditor.current || 
//                            (!templateContentLoaded.current && !discardInProgress.current && (isEmptyEditor || editorContent !== currentContent));
        
//         if (shouldUpdate) {
//             console.log("🔄 UPDATING EDITOR with content:", {
//                 forceUpdate: forceUpdateEditor.current,
//                 templateLoaded: templateContentLoaded.current,
//                 discardInProgress: discardInProgress.current,
//                 updatingTo: currentContent?.substring(0, 100) + "..."
//             });
            
//             editor.commands.setContent(currentContent || "", false);
            
//             // Reset flags after update
//             forceUpdateEditor.current = false;
            
//             // Only mark template as loaded if we loaded template content
//             if (currentContent === templateContentPreserved.current) {
//                 templateContentLoaded.current = true;
//             }
//         }
//     }, [currentContent, editor, initialLoadDone.current]);

//     // ✅ FIXED: Disable editor when another user has a draft
//     useEffect(() => {
//         if (!editor) return;
        
//         console.log("🔒 Setting editor editable:", !shouldLockEditor);
        
//         if (shouldLockEditor) {
//             console.log("🔒 LOCKING EDITOR - Another user has a draft");
//             editor.setEditable(false);
//             editor.commands.blur();
            
//             // Add visual feedback
//             const editorElement = editor.view.dom;
//             editorElement.style.cursor = 'not-allowed';
//         } else {
//             console.log("🔓 UNLOCKING EDITOR");
//             editor.setEditable(true);
            
//             // Remove visual feedback
//             const editorElement = editor.view.dom;
//             editorElement.style.cursor = '';
//         }
//     }, [editor, shouldLockEditor]);

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
//             {/* ✅ FIXED: Document Locked Banner */}
//             {shouldLockEditor && (
//                 <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
//                     <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
//                         <div className="flex items-center gap-2">
//                             <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
//                                 <Clock className="h-3 w-3 mr-1" />
//                                 Editing in Progress
//                             </Badge>
//                             <div className="text-sm text-blue-800">
//                                 Another user is editing this document.
//                                 You're viewing changes live, but editing is temporarily disabled.
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* ✅ ADDED: Discard button in draft mode banner */}
//             {actualIsDraftMode && !shouldLockEditor && (
//                 <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-5 duration-300">
//                     <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-lg">
//                         <div className="flex items-center gap-2">
//                             <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-300">
//                                 <Clock className="h-3 w-3 mr-1" />
//                                 You're editing
//                             </Badge>
//                             <div className="text-sm text-blue-800">
//                                 You are currently editing this document in draft mode.
//                             </div>
//                         </div>
//                         <div className="flex gap-2">
//                             <Button
//                                 size="sm"
//                                 onClick={handleDiscardDraft}
//                                 variant="outline"
//                                 className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
//                                 disabled={isUpdating}
//                             >
//                                 {isUpdating ? (
//                                     <Loader2 className="h-3 w-3 mr-1 animate-spin" />
//                                 ) : (
//                                     <X className="h-3 w-3 mr-1" />
//                                 )}
//                                 Discard
//                             </Button>
//                             <Button
//                                 size="sm"
//                                 onClick={async () => {
//                                     if (activeDraft?._id) {
//                                         await publishDraft({ draftId: activeDraft._id });
//                                     }
//                                 }}
//                                 disabled={!activeDraft?._id || isUpdating}
//                                 className="bg-blue-600 hover:bg-blue-700 text-white"
//                             >
//                                 Publish
//                             </Button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* Saving Indicator */}
//             {isUpdating && (
//                 <div className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-blue-100 text-blue-700 text-sm rounded-lg shadow flex items-center gap-2">
//                     <Loader2 className="h-3 w-3 animate-spin" />
//                     <span>Saving changes...</span>
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
