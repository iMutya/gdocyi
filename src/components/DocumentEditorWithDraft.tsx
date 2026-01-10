// // components/DocumentEditorWithDraft.tsx
// "use client";

// import { useMutation, useQuery } from "convex/react";
// import { api } from "../../convex/_generated/api";
// import { Id } from "../../convex/_generated/dataModel";
// // import { DraftModeIndicator } from "./DraftModeIndicator";
// import { Editor } from "@/app/documents/[documentId]/editor";

// interface DocumentEditorWithDraftProps {
//   documentId: Id<"documents">;
// }

// export function DocumentEditorWithDraft({ documentId }: DocumentEditorWithDraftProps) {
//   const document = useQuery(api.documents.getWithDraft, { id: documentId });
//   const updateContent = useMutation(api.documents.updateContent);
//   const updateDraft = useMutation(api.drafts.updateDraft);

//   const handleContentChange = async (content: string) => {
//     if (!document) return;

//     try {
//       if (document.isInDraftMode && document.activeDraftId) {
//         // Update draft content
//         await updateDraft({
//           draftId: document.activeDraftId,
//           content,
//         });
//       } else {
//         // Update main document (regular edit)
//         await updateContent({
//           id: documentId,
//           content,
//         });
//       }
//     } catch (error) {
//       console.error("Error updating content:", error);
//       // If error is about being in draft mode, ignore it
//       // Users should see the draft mode indicator
//     }
//   };

//   // Get content to display (draft or published)
//   const currentContent = document?.isInDraftMode
//     ? document.draftContent
//     : document?.initialContent || "";

//   if (!document) {
//     return <div>Loading...</div>;
//   }

//   return (
//     <div className="flex flex-col h-full">
      

//       {/* Editor area */}
//       <div className="flex-1 overflow-auto p-6">
//         <Editor
//           key={document.isInDraftMode ? "draft" : "published"}
//           documentId={documentId}  // Editor expects documentId
//           initialContent={currentContent}
//           isDraftMode={document.isInDraftMode}
//           // Editor doesn't have an onChange prop - it handles updates internally
//           // via the onUpdate callback in its useEditor hook
//         />
//       </div>
//     </div>
//   );
// }