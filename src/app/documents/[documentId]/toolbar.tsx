"use client"

import { cn } from "@/lib/utils";
import { useEditorStore } from "@/store/use-editor-store";
import { Separator } from "@/components/ui/separator";
import { 
    AlignCenterIcon, 
    AlignJustifyIcon, 
    AlignLeftIcon, 
    AlignRightIcon, 
    BoldIcon, 
    ChevronDownIcon, 
    EyeOff,
    HighlighterIcon, 
    ImageIcon, 
    ItalicIcon, 
    Link2Icon, 
    ListCollapseIcon, 
    ListIcon, 
    ListOrderedIcon, 
    ListTodoIcon, 
    LucideIcon, 
    MessageSquarePlusIcon, 
    MinusIcon, 
    Pencil,
    PlusIcon, 
    PrinterIcon, 
    Redo2Icon, 
    RemoveFormattingIcon, 
    SearchIcon, 
    SpellCheckIcon, 
    Strikethrough, 
    Underline, 
    Undo2Icon, 
    UploadIcon,
    Clock,
    Upload,
    X,
    FileText
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { type Level } from "@tiptap/extension-heading"
import { type ColorResult, SketchPicker } from "react-color"
import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";

// Add props interface for draft mode
interface ToolbarProps {
    isDraftMode?: boolean;
    documentId?: Id<"documents">;
}


const DraftControls = ({ documentId, isDraftMode }: { documentId?: Id<"documents">, isDraftMode?: boolean }) => {
    const [isLoading, setIsLoading] = useState(false);
    const { editor } = useEditorStore();

    // Get the main document to know what to revert to
    const document = useQuery(api.documents.getById, documentId ? { id: documentId } : "skip");
    
    const activeDraft = useQuery(api.drafts.getActiveDraft, 
        documentId ? { documentId } : "skip"
    );
    
    const getOrCreateDraft = useMutation(api.drafts.getOrCreateDraft);
    const publishDraft = useMutation(api.drafts.publishDraft);
    const discardDraft = useMutation(api.drafts.discardDraft);

    const getTimeLeft = () => {
        if (!activeDraft?.expiresAt) return null;
        const expiresIn = activeDraft.expiresAt - Date.now();
        if (expiresIn <= 0) return "Expired";
        const hours = Math.floor(expiresIn / (1000 * 60 * 60));
        const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return "< 1m";
    };

    const handleEnterDraftMode = useCallback(async () => {
        if (!documentId) return;
        setIsLoading(true);
        try {
            await getOrCreateDraft({ documentId });
            toast.success("Draft mode activated");
        } catch (error) {
            console.error("Failed to enter draft mode:", error);
            toast.error("Failed to enter draft mode");
        } finally {
            setIsLoading(false);
        }
    }, [documentId, getOrCreateDraft]);

    const handlePublishDraft = useCallback(async () => {
        if (!activeDraft?._id) return;
        setIsLoading(true);
        try {
            await publishDraft({ draftId: activeDraft._id });
            toast.success("Draft published");
        } catch (error) {
            console.error("Failed to publish draft:", error);
            toast.error("Failed to publish draft");
        } finally {
            setIsLoading(false);
        }
    }, [activeDraft?._id, publishDraft]);

    const handleExitDraftMode = useCallback(async () => {
        if (!activeDraft?._id) return;
        if (!confirm("Discard this draft?")) return;

        // Get the global lock from the store
        const { setIsDiscarding } = useEditorStore.getState();

        setIsLoading(true);
        try {
            // 1. ACTIVATE GLOBAL LOCK (Mutes the Editor)
            setIsDiscarding(true);

            await discardDraft({ draftId: activeDraft._id });

            if (editor) {
                const revertTo = document?.publishedContent || "";
                editor.commands.setContent(revertTo, false);
            }
            toast.success("Draft discarded");
        } catch (error) {
            console.error(error);
            setIsDiscarding(false); 
        } finally {
            setIsLoading(false);
            // 2. KEEP LOCKED FOR 1.5s (Allows Convex queries to refresh)
            setTimeout(() => setIsDiscarding(false), 1500);
        }
    }, [activeDraft, discardDraft, editor, document]);


    const timeLeft = getTimeLeft();
    const actualIsDraftMode = isDraftMode || !!activeDraft;

    if (actualIsDraftMode) {
        return (
            <div className="flex items-center gap-1">
                <Badge 
                    variant="outline" 
                    className={cn(
                        "flex items-center gap-1 px-2 py-1 text-xs font-medium",
                        timeLeft === "Expired" 
                            ? "bg-red-50 text-red-700 border-red-300"
                            : "bg-amber-50 text-amber-700 border-amber-300"
                    )}
                >
                    <EyeOff className="h-3 w-3" />
                    <span>Draft</span>
                    {timeLeft && timeLeft !== "Expired" && (
                        <>
                            <span className="mx-0.5">•</span>
                            <Clock className="h-3 w-3" />
                            <span>{timeLeft}</span>
                        </>
                    )}
                </Badge>
                
                <Separator orientation="vertical" className="h-6 bg-neutral-300" />
                
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleExitDraftMode}
                    disabled={isLoading}
                    className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200"
                    title="Discard draft without publishing"
                    >
                    <X className="h-3 w-3 mr-1" />
                    Discard Draft
                </Button>
                
                <Button
                    size="sm"
                    onClick={handlePublishDraft}
                    disabled={isLoading}
                    className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                >
                    <Upload className="h-3 w-3 mr-1" />
                    {isLoading ? "Publishing..." : "Publish"}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex items-center">
            <Button
                variant="ghost"
                size="sm"
                onClick={handleEnterDraftMode}
                disabled={isLoading || !documentId}
                className="h-7 px-2 text-xs"
            >
                <Pencil className="h-3 w-3 mr-1" />
                {isLoading ? "Entering..." : "Draft Mode"}
            </Button>
            <Separator orientation="vertical" className="h-6 bg-neutral-300" />
        </div>
    );
};

//end
const ViewAllDraftsButton = ({ documentId }: { documentId?: Id<"documents"> }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { user } = useUser();
    
    // Get data - documentId should be Id<"documents">
    const allDrafts = useQuery(api.drafts.getAllDocumentDrafts, 
        documentId ? { documentId } : "skip"
    );
    
    const myDraft = useQuery(api.drafts.getActiveDraft, 
        documentId ? { documentId } : "skip"
    );
    
    const otherDrafts = useQuery(api.drafts.getOtherUsersDrafts, 
        documentId ? { documentId } : "skip"
    );

    // Mutations
    const createDraftMutation = useMutation(api.drafts.getOrCreateDraft);
    const publishDraftMutation = useMutation(api.drafts.publishDraft);
    const mergeAnyDraftMutation = useMutation(api.drafts.mergeAnyDraft);
    const discardDraftMutation = useMutation(api.drafts.discardDraft);
    
    // Compare data
    const [compareDraftId, setCompareDraftId] = useState<string | null>(null);
    const compareData = useQuery(api.drafts.compareDraftWithMain, 
        compareDraftId ? { draftId: compareDraftId as Id<"draftDocuments"> } : "skip"
    );

    // Handlers
    const handleCreateDraft = async () => {
        if (!documentId) return;
        try {
            await createDraftMutation({ documentId });
            toast.success("Draft created! You can now edit it.");
            setIsOpen(false);
        } catch (error) {
            console.error("Failed to create draft:", error);
            toast.error("Failed to create draft. You might already have one.");
        }
    };

    const handleMergeDraft = async (draftId: string, isMyDraft: boolean) => {
        if (isMyDraft) {
            if (confirm("Publish your draft to the main document?")) {
                await publishDraftMutation({ draftId: draftId as Id<"draftDocuments"> });
                toast.success("Draft published!");
                setIsOpen(false);
            }
        } else {
            if (confirm("Merge this user's draft into the main document?")) {
                await mergeAnyDraftMutation({ draftId: draftId as Id<"draftDocuments"> });
                toast.success("Draft merged!");
                setIsOpen(false);
            }
        }
    };

    const handleDiscardDraft = async (draftId: string) => {
        if (confirm("Discard this draft permanently?")) {
            await discardDraftMutation({ draftId: draftId as Id<"draftDocuments"> });
            toast.success("Draft discarded");
            setIsOpen(false);
        }
    };

    // Get other users' drafts count
    const otherDraftsCount = allDrafts?.filter(d => d.ownerId !== user?.id).length || 0;
    
    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="h-7 min-w-7 shrink-0 flex items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm relative"
                title="View all drafts"
            >
                <FileText className="size-4" />
                {(otherDraftsCount > 0 || (allDrafts && allDrafts.length > 0)) && (
                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                        {otherDraftsCount > 0 ? otherDraftsCount : allDrafts?.length}
                    </span>
                )}
            </button>

            {/* FULL DRAFTS MODAL (like DraftsSidebar) */}
            {isOpen && documentId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="p-4 border-b">
                            <div className="flex justify-between items-center mb-2">
                                <h2 className="font-semibold text-gray-800 text-lg">📝 All Drafts</h2>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="text-gray-500 hover:text-gray-700 p-1"
                                >
                                    ✕
                                </button>
                            </div>
                            <p className="text-sm text-gray-500">
                                {allDrafts?.length || 0} active draft{allDrafts?.length !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {/* My Draft Section */}
                            <div className="mb-6">
                                <h3 className="text-sm font-medium text-gray-700 mb-2">My Draft</h3>
                                {myDraft ? (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <div className="font-medium text-blue-800">You</div>
                                                <div className="text-xs text-blue-600">
                                                    Updated {formatDistanceToNow(myDraft.lastUpdatedAt, { addSuffix: true })}
                                                </div>
                                            </div>
                                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                                Active
                                            </span>
                                        </div>
                                        
                                        <div className="text-sm text-blue-700 mb-4 line-clamp-3 bg-white p-2 rounded border">
                                            {myDraft.content.replace(/<[^>]*>/g, '').substring(0, 200)}...
                                        </div>
                                        
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleMergeDraft(myDraft._id, true)}
                                                className="flex-1 bg-blue-600 text-white text-sm px-3 py-2 rounded hover:bg-blue-700"
                                            >
                                                Publish
                                            </button>
                                            <button
                                                onClick={() => handleDiscardDraft(myDraft._id)}
                                                className="flex-1 bg-red-100 text-red-700 text-sm px-3 py-2 rounded hover:bg-red-200"
                                            >
                                                Discard
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="border border-dashed border-gray-300 rounded-lg p-6 text-center">
                                        <p className="text-sm text-gray-500 mb-3">You don't have a draft yet</p>
                                        <button
                                            onClick={handleCreateDraft}
                                            className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800"
                                        >
                                            + Start New Draft
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Others' Drafts Section */}
                            {otherDrafts && otherDrafts.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-medium text-gray-700 mb-2">
                                        Other Drafts ({otherDrafts.length})
                                    </h3>
                                    <div className="space-y-3">
                                        {otherDrafts.map((draft) => (
                                            <div
                                                key={draft._id}
                                                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div>
                                                        <div className="font-medium text-gray-800">
                                                            {draft.ownerId === user?.id ? 'You' : `User ${draft.ownerId.substring(0, 6)}`}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            Updated {formatDistanceToNow(draft.lastUpdatedAt, { addSuffix: true })}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => setCompareDraftId(draft._id)}
                                                            className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
                                                            title="Compare with main"
                                                        >
                                                            🔍
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                <div className="text-sm text-gray-600 mb-3 line-clamp-2 bg-gray-50 p-2 rounded">
                                                    {draft.content.replace(/<[^>]*>/g, '').substring(0, 150)}...
                                                </div>
                                                
                                                <button
                                                    onClick={() => handleMergeDraft(draft._id, false)}
                                                    className="w-full text-sm bg-gray-800 text-white px-3 py-2 rounded hover:bg-gray-900"
                                                >
                                                    Merge into Main
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* No other drafts message */}
                            {otherDrafts && otherDrafts.length === 0 && allDrafts && allDrafts.length > 0 && (
                                <div className="text-center py-8 text-gray-500">
                                    <div className="text-2xl mb-2">👥</div>
                                    <p className="text-sm">No other drafts from other users</p>
                                </div>
                            )}
                        </div>

                        {/* Compare Modal (nested) */}
                        {compareDraftId && compareData && (
                            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
                                <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden">
                                    <div className="flex justify-between items-center p-4 border-b">
                                        <h3 className="font-semibold text-lg">Compare Draft</h3>
                                        <button
                                            onClick={() => setCompareDraftId(null)}
                                            className="text-gray-500 hover:text-gray-700"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 h-[70vh]">
                                        <div className="border-r p-4 overflow-auto">
                                            <h4 className="font-medium text-gray-700 mb-2">Main Document</h4>
                                            <div className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded border h-full overflow-auto">
                                                {compareData.mainContent}
                                            </div>
                                        </div>
                                        <div className="p-4 overflow-auto">
                                            <h4 className="font-medium text-gray-700 mb-2">Draft Content</h4>
                                            <div className="text-sm whitespace-pre-wrap bg-blue-50 p-4 rounded border h-full overflow-auto">
                                                {compareData.draftContent}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-4 border-t">
                                        <button
                                            onClick={() => {
                                                handleMergeDraft(compareDraftId, compareData.draftOwnerId === user?.id);
                                                setCompareDraftId(null);
                                            }}
                                            className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
                                        >
                                            Merge This Draft
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

const LineHeightButton = () => {
    const { editor } = useEditorStore();

    const lineHeights = [
        { label: "Default", value: "normal"},
        { label: "Single", value: "1"},
        { label: "1.15", value: "1.15"},
        { label: "1.5", value: "1.5"},
        { label: "Double", value: "2"},
    ]
    
    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <ListCollapseIcon className="size-4"/>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1 flex flex-col gap-y-1">
                {lineHeights.map(({ label, value}) => (
                    <button
                        key={value}
                        onClick={() => editor?.chain().focus().setLineHeight(value).run()}
                        className={cn(
                            "flex items-center gap-x-2 px-2 py-1 rounded-sm hover:bg-neutral-200/80",
                            editor?.getAttributes("paragraph").lineHeight === value && "bg-neutral-200/80"
                        )}
                    >
                        <span className="text-sm">{label}</span>
                    </button>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const FontSizeButton = () => {
    const { editor } = useEditorStore();

    const currentFontSize = editor?.getAttributes("textStyle").fontSize
        ? editor?.getAttributes("textStyle").fontSize.replace("px", "")
        : "16";

    const [fontSize, setFontSize] = useState(currentFontSize);
    const [inputValue, setInputValue] = useState(fontSize);
    const [isEditing, setIsEditing] = useState(false);

    const updateFontSize = (newSize: string) => {
        const size = parseInt(newSize);
        if (!isNaN(size) && size > 0) {
            editor?.chain().focus().setFontSize(`${size}px`).run();
            setFontSize(newSize);
            setInputValue(newSize);
            setIsEditing(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
        updateFontSize(inputValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            updateFontSize(inputValue);
            editor?.commands.focus();
        }
    };

    const increment = () => {
        const newSize = parseInt(fontSize) + 1;
        updateFontSize(newSize.toString());
    };

    const decrement = () => {
        const newSize = parseInt(fontSize) - 1;
        if (newSize > 0 ) {
            updateFontSize(newSize.toString());
        }
    };

    return(
        <div className="flex items-center gap-x-0.5">
            <button
                onClick={decrement}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-sm hover:bg-neutral-200/80"
            >
                <MinusIcon className="size-4"/>
            </button>
            {isEditing ? (
                <input 
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onBlur={handleInputBlur}
                    onKeyDown={handleKeyDown}
                    className="h-7 w-10 text-sm border border-neutral-400 text-center rounded-sm hover:bg-neutral-200/80 focus:outline-none focus:ring-0"                
                />
            ) : (
                <button
                    onClick={() => {
                        setIsEditing(true);
                        setFontSize(currentFontSize);
                    }}
                    className="h-7 w-10 text-sm border border-neutral-400 text-center rounded-sm bg-transparent cursor-text"                
                >
                    {currentFontSize}
                </button>
            )}
            <button
                onClick={increment}
                className="h-7 w-7 shrink-0 flex items-center justify-center rounded-sm hover:bg-neutral-200/80"
            >
                <PlusIcon className="size-4"/>
            </button>
        </div>
    );
};

const ListButton = () => {
    const { editor } = useEditorStore();

    const lists = [
        {
            label: "Bullet List",
            icon: ListIcon,
            isActive: () => editor?.isActive("bulletList"),
            onClick: () => editor?.chain().focus().toggleBulletList().run(),
        },
        {
            label: "Ordered List",
            icon: ListOrderedIcon,
            isActive: () => editor?.isActive("orderedList"),
            onClick: () => editor?.chain().focus().toggleOrderedList().run(),
        },
    ];
    
    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <ListIcon className="size-4"/>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1 flex flex-col gap-y-1">
                {lists.map(({ label, icon: Icon, onClick, isActive}) => (
                    <button
                        key={label}
                        onClick={onClick}
                        className={cn(
                            "flex items-center gap-x-2 px-2 py-1 rounded-sm hover:bg-neutral-200/80",
                            isActive() && "bg-neutral-200/80"
                        )}
                    >
                        <Icon className="size-4"/>
                        <span className="text-sm">{label}</span>
                    </button>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const AlignButton = () => {
    const { editor } = useEditorStore();

    const alignments = [
        {
            label: "Align Left",
            value: "left",
            icon: AlignLeftIcon,
        },
        {
            label: "Align Center",
            value: "center",
            icon: AlignCenterIcon,
        },
        {
            label: "Align Right",
            value: "right",
            icon: AlignRightIcon,
        },
        {
            label: "Align Justify",
            value: "justify",
            icon: AlignJustifyIcon,
        },
    ];
    
    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <AlignLeftIcon className="size-4"/>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1 flex flex-col gap-y-1">
                {alignments.map(({ label, value, icon: Icon}) => (
                    <button
                        key={value}
                        onClick={() => editor?.chain().focus().setTextAlign(value).run()}
                        className={cn(
                            "flex items-center gap-x-2 px-2 py-1 rounded-sm hover:bg-neutral-200/80",
                            editor?.isActive({textAlign: value}) && "bg-neutral-200/80"
                        )}
                    >
                        <Icon className="size-4"/>
                        <span className="text-sm">{label}</span>
                    </button>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const ImageButton = () => {
    const { editor } = useEditorStore();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [imageUrl, setImageurl] = useState("");

    const onChange = (src: string) => {
        editor?.chain().focus().setImage({ src }).run();
    };

    const onUpload = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";

        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const imageUrl = URL.createObjectURL(file);
                onChange(imageUrl);
            }
        };

        input.click();
    };

    const handleImageUrlSubmit = () => {
        if (imageUrl){
            onChange(imageUrl);
            setImageurl("");
            setIsDialogOpen(false);
        }
    };

    return(
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                    >
                        <ImageIcon className="size-4"/>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onClick={onUpload}>
                        <UploadIcon className="size-4 mr-2" />
                        Upload
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsDialogOpen(true)}>
                        <SearchIcon className="size-4 mr-2" />
                        Paste Image Url
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Insert Image Url</DialogTitle>
                    </DialogHeader>
                    <Input 
                        placeholder="Insert Image Url"
                        value={imageUrl}
                        onChange={(e) => setImageurl(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter"){
                                handleImageUrlSubmit();
                            }
                        }}
                    />
                    <DialogFooter>
                        <Button onClick={handleImageUrlSubmit}>
                            Insert
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};

const LinkButton = () => {
    const { editor } = useEditorStore();

    const [value, setValue] = useState("");

    const onChange = (href: string) => {
        editor?.chain().focus().extendMarkRange("link").setLink({ href }).run();
        setValue("");
    };

    return(
        <DropdownMenu onOpenChange={(open) => {
            if(open) {
                setValue(editor?.getAttributes("link").href || "")
            }
        }}>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <Link2Icon className="size-4"/>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-2.5 flex items-center gap-x-2">
                <Input 
                    placeholder="https.example.com"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                <Button onClick={() => onChange(value)}>
                    Apply
                </Button> 
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const HighlightColorButton = () => {
    const { editor } = useEditorStore();

    const value = editor?.getAttributes('highlight').color || "#FFFFFF";

    const onChange = (color: ColorResult) => {
        editor?.chain().focus().setHighlight({color: color.hex}).run();
    };
    
    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <HighlighterIcon className="size-4"/>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-0">
                <SketchPicker
                    color={value}
                    onChange={onChange}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const TextColorButton = () => {
    const { editor } = useEditorStore();

    const value = editor?.getAttributes("textStyle").color || "#000000";

    const onChange = (color: ColorResult) => {
        editor?.chain().focus().setColor(color.hex).run();
    };
    
    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex flex-col items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <span className="text-xs">A</span>
                    <div className="h-0.5 w-full" style={{background: value}} />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-0">
                <SketchPicker
                    color={value}
                    onChange={onChange}
                />
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const HeadingLevelButton = () => {
    const { editor } = useEditorStore();

    const headings = [
        { label: "Normal text", value: 0, fontSize: "12px"},
        { label: "Heading 1", value: 1, fontSize: "32px"},
        { label: "Heading 2", value: 2, fontSize: "24px"},
        { label: "Heading 3", value: 3, fontSize: "20px"},
        { label: "Heading 4", value: 4, fontSize: "18px"},
        { label: "Heading 5", value: 5, fontSize: "16px"},
    ];

    const getCurrentHeading = () => {
        for(let level = 1; level <= 5; level++){
            if(editor?.isActive("heading", { level })) {
                return `Heading ${level}`;
            }
        }

        return "Normal text";
    };

    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 min-w-7 shrink-0 flex items-center justify-center rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <span className="truncate">
                        {getCurrentHeading()}
                    </span>
                    <ChevronDownIcon className="ml-2 size-4 shrink-0"/> 
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1 flex flex-col gap-y-1">
                {headings.map(({ label, value, fontSize}) => (
                    <button
                        key={value}
                        style={{ fontSize }}
                        onClick={() => {
                            if(value === 0){
                                editor?.chain().focus().setParagraph().run();
                            }else{
                                editor?.chain().focus().toggleHeading({ level: value as Level}).run();
                            }
                        }}
                        className={cn(
                            "flex items-center gap-x-2 px-2 py-1 rounded-sm hover:bg-neutral-200/80",
                            (value === 0 && !editor?.isActive("heading")) || editor?.isActive("heading", {level: value}) && "bg-neutral-200/80"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

const FontFamilyButton = () => {
    const { editor } = useEditorStore();
    
    const fonts = [
        {label: "Arial", value: "Arial"},
        {label: "Times New Roman", value: "Times New Roman"},
        {label: "Georgia", value: "Georgia"},
        {label: "Courier New", value: "Courier New"},
        {label: "Inter", value: "Inter"},
        {label: "cursive", value: "cursive"},
    ];

    return(
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="h-7 w-[120px] shrink-0 flex items-center justify-between rounded-sm hover:bg-neutral-200/80 px-1.5 overflow-hidden text-sm"
                >
                    <span className="truncate">
                        {editor?.getAttributes("textStyle").fontFamily || "Arial"}
                    </span>
                    <ChevronDownIcon className="ml-2 size-4 shrink-0"/> 
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1 flex flex-col gap-y-1">
                {fonts.map(({label, value}) => (
                    <button
                        onClick={() => editor?.chain().focus().setFontFamily(value).run()}
                        key={value}
                        className={cn(
                            "flex items-center gap-x-2 px-2 py-1 rounded-sm hover:bg-neutral-200/80",
                            editor?.getAttributes("textStyle").fontFamily === value && "bg-neutral-200/80"
                        )}
                        style={{ fontFamily: value}}
                    >
                        <span className="text-sm">{label}</span>
                    </button>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

interface ToolbarButtonProps {
    onClick?: () => void;
    isActive?: boolean;
    icon: LucideIcon;
};

const ToolbarButton = ({
    onClick,
    isActive,
    icon: Icon,
}: ToolbarButtonProps) => {
    return(
        <button
            onClick={onClick}
            className={cn(
                "text-sm h-7 min-h-7 flex items-center justify-center rounded-sm hover:bg-neutral-200/80",
                isActive && "bg-neutral-200/80 "
            )}
        >
            <Icon className="size-4" />
        </button>
    );
};

export const Toolbar = ({ isDraftMode = false, documentId }: ToolbarProps) => {
    const { editor } = useEditorStore();

    const sections: {
        label: string; 
        icon: LucideIcon; 
        onClick: () => void;
        isActive?: boolean;
    }[][] = [
        [
            {
                label: "Undo",
                icon: Undo2Icon,
                onClick: () => editor?.chain().focus().undo().run(),  
            },
            {
                label: "Redo",
                icon: Redo2Icon,
                onClick: () => editor?.chain().focus().redo().run(),
            },
            {
                label: "Print",
                icon: PrinterIcon,
                onClick: () =>  window.print(),
            },
            {
                label: "Spell Check",
                icon: SpellCheckIcon,
                onClick: () => {
                    const current = editor?.view.dom.getAttribute("spellcheck");
                    editor?.view.dom.setAttribute("spellcheck", current === "false" ? "true" : "false")
                }
            },
        ],
        [
            {
                label: "Bold",
                icon: BoldIcon,
                isActive: editor?.isActive("bold"),
                onClick: () => editor?.chain().focus().toggleBold().run(),
            },
            {
                label: "Italic",
                icon: ItalicIcon,
                isActive: editor?.isActive("italic"),
                onClick: () => editor?.chain().focus().toggleItalic().run(),
            },
            {
                label: "Underline",
                icon: Underline,
                isActive: editor?.isActive("underline"),
                onClick: () => editor?.chain().focus().toggleUnderline().run(),
            },
            {
                label: "Strike",
                icon: Strikethrough,
                isActive: editor?.isActive("strike"),
                onClick: () => editor?.chain().focus().toggleStrike().run(),
            },
        ],
        [
            {
                label: "Comment",
                icon: MessageSquarePlusIcon,
                onClick: () => {
                    if (!isDraftMode) {
                    editor?.chain().focus().addPendingComment().run();
                    } else {
                    toast.info("Comments are disabled in draft mode. Publish your draft to enable comments.");
                    }
                },
                isActive: !isDraftMode && editor?.isActive("liveblocksCommentMark"),
            },
            {
                label: "List Todo",
                icon: ListTodoIcon,
                onClick: () => editor?.chain().focus().toggleTaskList().run(),
                isActive: editor?.isActive("taskList"),
            },
            {
                label: "Remove Formatting",
                icon: RemoveFormattingIcon,
                onClick: () => editor?.chain().focus().unsetAllMarks().run(),
            },
        ],
    ];

    // Add draft mode styling to toolbar
    const toolbarClasses = cn(
        "bg-[#F1F4F9] px-2.5 py-0.5 rounded-[24px] min-h-[40px] flex items-center gap-x-0.5 overflow-x-auto",
        isDraftMode && "border border-amber-300 bg-amber-50/50"
    );

    return(
        <div className={toolbarClasses}>
            {/* Draft Controls Section */}
            <DraftControls 
                documentId={documentId} 
                isDraftMode={isDraftMode} 
            />
            
            {/*  */}
            {/* ADD THIS: View All Drafts Button */}
            {documentId && (
                <>
                    <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
                    <ViewAllDraftsButton documentId={documentId} />
                </>
            )}


            {sections[0].map((item) => (
                <ToolbarButton key={item.label} {...item}/>
            ))}
            
            <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
            
            <FontFamilyButton />
            <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
            
            <HeadingLevelButton/>
            <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
            
            <FontSizeButton />
            <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
            
            {sections[1].map((item) => (
                <ToolbarButton key={item.label} {...item}/>
            ))}
            
            <TextColorButton />
            <HighlightColorButton />
            <Separator orientation="vertical" className="h-6 bg-neutral-300"/>
            
            <LinkButton />
            <ImageButton />
            <AlignButton />
            <LineHeightButton />
            <ListButton />
            
            {sections[2].map((item) => (
                <ToolbarButton key={item.label} {...item}/>
            ))}
        </div>
    );
};
