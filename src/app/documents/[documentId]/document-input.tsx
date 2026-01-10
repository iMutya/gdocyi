"use client";

import { BsCloudCheck, BsCloudSlash } from "react-icons/bs";
import { Id } from "../../../../convex/_generated/dataModel";
import { useRef, useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useDebounce } from "@/hooks/use-debounce";
import { toast } from "sonner";
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
    const [value, setValue] = useState(title);
    const [isPending, setIsPending] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [connectionState, setConnectionState] = useState<"connected" | "disconnected" | "connecting">("connecting");

    const inputRef = useRef<HTMLInputElement>(null);
    const mutate = useMutation(api.documents.updateById);

    // Update local value when title prop changes
    useEffect(() => {
        if (!isEditing) {
            setValue(title);
        }
    }, [title, isEditing]);

    // Simulate connection status
    useEffect(() => {
        if (isDraftMode) {
            // In draft mode, show as connected immediately
            setConnectionState("connected");
            return;
        }
        
        // For non-draft mode, simulate connection process
        setConnectionState("connecting");
        
        const timer = setTimeout(() => {
            setConnectionState("connected");
        }, 1000);
        
        // You could add error simulation here
        const errorTimer = setTimeout(() => {
            // Simulate occasional disconnections
            if (Math.random() > 0.9) {
                setConnectionState("disconnected");
                
                // Auto-reconnect after 3 seconds
                setTimeout(() => {
                    setConnectionState("connected");
                }, 3000);
            }
        }, 5000);
        
        return () => {
            clearTimeout(timer);
            clearTimeout(errorTimer);
        };
    }, [isDraftMode]);

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

    // Get connection status text based on connectionState
    const getConnectionStatus = () => {
        if (isDraftMode) {
            return {
                showError: false,
                showLoader: isPending,
                showSuccess: !isPending,
                text: isPending ? "Saving draft..." : "Draft mode"
            };
        }
        
        switch (connectionState) {
            case "connected":
                return {
                    showError: false,
                    showLoader: false,
                    showSuccess: true,
                    text: "Live"
                };
            case "disconnected":
                return {
                    showError: true,
                    showLoader: false,
                    showSuccess: false,
                    text: "Offline"
                };
            case "connecting":
                return {
                    showError: false,
                    showLoader: true,
                    showSuccess: false,
                    text: "Connecting..."
                };
            default:
                return {
                    showError: false,
                    showLoader: true,
                    showSuccess: false,
                    text: "Connecting..."
                };
        }
    };

    const connectionStatus = getConnectionStatus();
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

            
            {/* Connection Status Indicators */}
            <div className="flex items-center gap-1 ml-2">
                {connectionStatus.showError && <BsCloudSlash className="size-4 text-red-500" />}
                {connectionStatus.showSuccess && <BsCloudCheck className="size-4 text-green-500" />}
                {connectionStatus.showLoader && <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
                
                {/* Status Text */}
                <span className={cn(
                    "text-xs",
                    connectionStatus.showError ? "text-red-600" : 
                    connectionStatus.showSuccess ? "text-green-600" : 
                    "text-muted-foreground"
                )}>
                    {connectionStatus.text}
                </span>
            </div>
        </div>
    );
};