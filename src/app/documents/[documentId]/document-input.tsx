import { BsCloudCheck, BsCloudSlash } from "react-icons/bs";
import { Id } from "../../../../convex/_generated/dataModel";
import { useRef, useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
import { useStatus } from "@liveblocks/react";
import { LoaderIcon, EyeOff, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface DocumentInputProps {
    title: string;
    id: Id<"documents">;
    isDraftMode?: boolean;
    draftExpiresAt?: number;
}

export const DocumentInput = ({ title, id, isDraftMode = false, draftExpiresAt }: DocumentInputProps) => {
    const status = useStatus();

    const [value, setValue] = useState(title);
    const [isPending, setIsPending] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const mutate = useMutation(api.documents.updateById);

    // Update local value when title prop changes
    useEffect(() => {
        if (!isEditing) {
            setValue(title);
        }
    }, [title, isEditing]);

    const debouncedUpdate = useDebounce((newValue: string) => {
        if (newValue === title) return;

        setIsPending(true);
        mutate({ id, title: newValue })
            .then(() => {
                if (isDraftMode) {
                    toast.success("Draft title updated");
                } else {
                    toast.success("Document updated");
                }
            })
            .catch(() => toast.error("Something went wrong"))
            .finally(() => setIsPending(false));
    });

    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        debouncedUpdate(newValue);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        setIsPending(true);
        mutate({ id, title: value })
            .then(() => {
                if (isDraftMode) {
                    toast.success("Draft title updated");
                } else {
                    toast.success("Document updated");
                }
                setIsEditing(false);
            })
            .catch(() => toast.error("Something went wrong"))
            .finally(() => setIsPending(false));
    };

    const handleBlur = () => {
        if (value !== title) {
            setIsPending(true);
            mutate({ id, title: value })
                .then(() => {
                    if (isDraftMode) {
                        toast.success("Draft title updated");
                    } else {
                        toast.success("Document updated");
                    }
                })
                .catch(() => toast.error("Something went wrong"))
                .finally(() => {
                    setIsPending(false);
                    setIsEditing(false);
                });
        } else {
            setIsEditing(false);
        }
    };

    // Calculate time left for draft
    const getTimeLeft = () => {
        if (!isDraftMode || !draftExpiresAt) return null;
        
        const expiresIn = draftExpiresAt - Date.now();
        if (expiresIn <= 0) return "Expired";
        
        const hours = Math.floor(expiresIn / (1000 * 60 * 60));
        const minutes = Math.floor((expiresIn % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return "< 1m";
    };

    const showLoader = isPending || status === "connecting" || status === "reconnecting";
    const showError = status === "disconnected";
    const timeLeft = getTimeLeft();

    return (
        <div className="flex items-center gap-2">
            {/* Document Title Input */}
            <div className="relative">
                {isEditing ? (
                    <form onSubmit={handleSubmit} className="relative">
                        <span className="invisible whitespace-pre px-1.5 text-lg font-medium">
                            {value || " "}
                        </span>
                        <input
                            ref={inputRef}
                            value={value}
                            onBlur={handleBlur}
                            onChange={onChange}
                            className={cn(
                                "absolute inset-0 text-lg font-medium px-1.5 bg-transparent truncate outline-none",
                                isDraftMode 
                                    ? "text-amber-700 border-b-2 border-amber-500" 
                                    : "text-black"
                            )}
                            placeholder="Document title"
                            autoComplete="off"
                        />
                    </form>
                ) : (
                    <span
                        onClick={() => {
                            setIsEditing(true);
                            setTimeout(() => {
                                inputRef.current?.focus();
                                inputRef.current?.select();
                            }, 0);
                        }}
                        className={cn(
                            "text-lg font-medium px-1.5 cursor-pointer truncate hover:bg-gray-100 rounded transition-colors",
                            isDraftMode ? "text-amber-700" : "text-black"
                        )}
                    >
                        {title}
                    </span>
                )}
            </div>

            {/* Draft Mode Badge */}
            {isDraftMode && (
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
                            <span className="mx-1">•</span>
                            <Clock className="h-3 w-3" />
                            <span>{timeLeft}</span>
                        </>
                    )}
                    {timeLeft === "Expired" && (
                        <span className="ml-1 font-bold">EXPIRED</span>
                    )}
                </Badge>
            )}

            {/* Connection Status Indicators */}
            <div className="flex items-center gap-1 ml-2">
                {showError && <BsCloudSlash className="size-4 text-red-500" />}
                {!showError && !showLoader && <BsCloudCheck className="size-4 text-green-500" />}
                {showLoader && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
                
                {/* Draft Save Indicator */}
                {isDraftMode && isPending && (
                    <span className="text-xs text-amber-600 ml-1">
                        Saving draft...
                    </span>
                )}
            </div>
        </div>
    );
};









// import { BsCloudCheck, BsCloudSlash} from "react-icons/bs"
// import { Id } from "../../../../convex/_generated/dataModel";
// import { useRef, useState } from "react";
// import { useMutation } from "convex/react";
// import { api } from "../../../../convex/_generated/api";
// import { useDebounce } from "@/hooks/use-debounce";
// import { toast } from "sonner";
// import { useStatus } from "@liveblocks/react";
// import { LoaderIcon } from "lucide-react";

// interface DocumentInputProps{
//     title: string;
//     id: Id<"documents">;
// }

// export const DocumentInput = ({title, id}: DocumentInputProps) => {
//     const status = useStatus();

//     const [value, setValue] = useState(title);
//     const [isPending, setIsPending] = useState(false);
//     const [isEditing, setIsEditing] = useState(false);

//     const inputRef = useRef<HTMLInputElement>(null);
//     const mutate = useMutation(api.documents.updateById)

//     const debouncedUpdate = useDebounce((newValue: string) => {
//         if (newValue === title) return;

//         setIsPending(true);
//         mutate({id, title: newValue})
//             .then(() => toast.success("Document updated"))
//             .catch(() => toast.error("Something went wrong"))
//             .finally(() => setIsPending(false));
//     })

//     const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const newValue = e.target.value;
//         setValue(newValue);
//         debouncedUpdate(newValue);
//     };

//     const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
//         e.preventDefault();

//         setIsPending(true);
//         mutate({id, title: value})
//             .then(() => {
//                 toast.success("Document updated");
//                 setIsEditing(false);
//             })
//             .catch(() => toast.error("Something went wrong"))
//             .finally(() => setIsPending(false));
//     }

//     const showLoader = isPending || status === "connecting" || status === "reconnecting";
//     const showError = status === "disconnected";
    
//     return(
//         <div className="flex items-center gap-2">
//             {isEditing ? (
//                 <form onSubmit={handleSubmit} className="relative w-fit max-w-[50ch]">
//                     <span className="invisible whitespace-pre px-1.5 text-lg">
//                         {value || " "}
//                     </span>
//                     <input
//                         ref={inputRef}
//                         value={value}
//                         onBlur={() => setIsEditing(false)}
//                         onChange={onChange}
//                         className="absolute inset-0 text-lg text-black px-1.5 bg-transparent truncate"
//                     />
//                 </form>
//             ): (
//                 <span
//                     onClick={() => {
//                         setIsEditing(true);
//                         setTimeout(() => {
//                             inputRef.current?.focus();
//                         },0);
//                     }}
//                 className="text-lg px-1.5 cursor-pointer truncate">{title}</span>
//             )}
//             {showError && <BsCloudSlash className="size-4"/>}
//             {!showError && !showLoader && <BsCloudCheck className="size-4"/>}
//             {showLoader && <LoaderIcon className="size-4 animate-spin text-muted-foreground"/>}
//         </div>
//     )
// }