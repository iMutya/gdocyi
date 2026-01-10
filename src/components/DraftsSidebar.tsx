// // components/DraftsSidebar.tsx
// "use client";

// import { useQuery, useMutation } from "convex/react";
// import { useUser } from "@clerk/nextjs";
// import { api } from "../../convex/_generated/api";
// import { formatDistanceToNow } from "date-fns";
// import { useState } from "react";
// import { Id } from "../../convex/_generated/dataModel";

// interface DraftsSidebarProps {
//   documentId: string;
// }

// export function DraftsSidebar({ documentId }: DraftsSidebarProps) {
//   const { user } = useUser();
//   const [compareDraftId, setCompareDraftId] = useState<string | null>(null);
//   const [showAllDrafts, setShowAllDrafts] = useState(true);

//   // Get data
//   const allDrafts = useQuery(api.drafts.getAllDocumentDrafts, { 
//     documentId: documentId as Id<"documents"> 
//   });
  
//   const myDraft = useQuery(api.drafts.getActiveDraft, { 
//     documentId: documentId as Id<"documents"> 
//   });
  
//   const otherDrafts = useQuery(api.drafts.getOtherUsersDrafts, { 
//     documentId: documentId as Id<"documents"> 
//   });

//   // Mutations
//   const createDraft = useMutation(api.drafts.getOrCreateDraft);
//   const publishDraft = useMutation(api.drafts.publishDraft);
//   const mergeAnyDraft = useMutation(api.drafts.mergeAnyDraft);
//   const discardDraft = useMutation(api.drafts.discardDraft);
//   const compareData = useQuery(api.drafts.compareDraftWithMain, 
//   compareDraftId ? { draftId: compareDraftId as Id<"draftDocuments"> } : "skip"
// );


//   // Handlers
//   const handleCreateDraft = async () => {
//     try {
//       const draftId = await createDraft({ documentId: documentId as Id<"documents"> });
//       // Your existing draft flow will handle the rest
//       alert("Draft created! You can now edit it.");
//     } catch (error) {
//       console.error("Failed to create draft:", error);
//       alert("Failed to create draft. You might already have one.");
//     }
//   };

//   const handleMergeDraft = async (draftId: string, isMyDraft: boolean) => {
//     if (isMyDraft) {
//       if (confirm("Publish your draft to the main document?")) {
//         await publishDraft({ draftId: draftId as Id<"draftDocuments"> });
//       }
//     } else {
//       if (confirm("Merge this user's draft into the main document?")) {
//         await mergeAnyDraft({ draftId: draftId as Id<"draftDocuments"> });
//       }
//     }
//   };

//   const handleDiscardDraft = async (draftId: string) => {
//     if (confirm("Discard this draft permanently?")) {
//       await discardDraft({ draftId: draftId as Id<"draftDocuments"> });
//     }
//   };

//   // Loading state
//   if (allDrafts === undefined) {
//     return (
//       <div className="w-80 border-l bg-gray-50 p-4">
//         <div className="animate-pulse">
//           <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
//           <div className="space-y-3">
//             <div className="h-20 bg-gray-200 rounded"></div>
//             <div className="h-20 bg-gray-200 rounded"></div>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full">
//       {/* Header */}
//       <div className="p-4 border-b">
//         <div className="flex justify-between items-center mb-2">
//           <h2 className="font-semibold text-gray-800">📝 Drafts</h2>
//           <button
//             onClick={() => setShowAllDrafts(!showAllDrafts)}
//             className="text-sm text-gray-500 hover:text-gray-700"
//           >
//             {showAllDrafts ? "Hide" : "Show"}
//           </button>
//         </div>
//         <p className="text-sm text-gray-500">
//           {allDrafts?.length || 0} active draft{allDrafts?.length !== 1 ? 's' : ''}
//         </p>
//       </div>

//       {showAllDrafts && (
//         <div className="flex-1 overflow-y-auto p-4 space-y-4">
//           {/* My Draft Section */}
//           <div>
//             <h3 className="text-sm font-medium text-gray-700 mb-2">My Draft</h3>
//             {myDraft ? (
//               <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
//                 <div className="flex justify-between items-start mb-2">
//                   <div>
//                     <div className="font-medium text-blue-800">You</div>
//                     <div className="text-xs text-blue-600">
//                       Updated {formatDistanceToNow(myDraft.lastUpdatedAt, { addSuffix: true })}
//                     </div>
//                   </div>
//                   <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
//                     Active
//                   </span>
//                 </div>
                
//                 <div className="text-xs text-blue-700 mb-3 line-clamp-2">
//                   {myDraft.content.substring(0, 100)}...
//                 </div>
                
//                 <div className="flex gap-2">
//                   <button
//                     onClick={() => handleMergeDraft(myDraft._id, true)}
//                     className="flex-1 bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700"
//                   >
//                     Publish
//                   </button>
//                   <button
//                     onClick={() => handleDiscardDraft(myDraft._id)}
//                     className="flex-1 bg-red-100 text-red-700 text-sm px-3 py-1.5 rounded hover:bg-red-200"
//                   >
//                     Discard
//                   </button>
//                 </div>
//               </div>
//             ) : (
//               <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
//                 <p className="text-sm text-gray-500 mb-3">No draft yet</p>
//                 <button
//                   onClick={handleCreateDraft}
//                   className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800"
//                 >
//                   + Start New Draft
//                 </button>
//               </div>
//             )}
//           </div>

//           {/* Others' Drafts Section */}
//           {otherDrafts && otherDrafts.length > 0 && (
//             <div>
//               <h3 className="text-sm font-medium text-gray-700 mb-2">
//                 Other Drafts ({otherDrafts.length})
//               </h3>
//               <div className="space-y-3">
//                 {otherDrafts.map((draft) => (
//                   <div
//                     key={draft._id}
//                     className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50"
//                   >
//                     <div className="flex justify-between items-start mb-2">
//                       <div>
//                         <div className="font-medium text-gray-800">
//                           {draft.ownerId === user?.id ? 'You' : `User ${draft.ownerId.substring(0, 6)}`}
//                         </div>
//                         <div className="text-xs text-gray-500">
//                           Updated {formatDistanceToNow(draft.lastUpdatedAt, { addSuffix: true })}
//                         </div>
//                       </div>
//                       <div className="flex gap-1">
//                         <button
//                           onClick={() => setCompareDraftId(draft._id)}
//                           className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
//                           title="Compare with main"
//                         >
//                           🔍
//                         </button>
//                       </div>
//                     </div>
                    
//                     <div className="text-xs text-gray-600 mb-3 line-clamp-2">
//                       {draft.content.substring(0, 80)}...
//                     </div>
                    
//                     <button
//                       onClick={() => handleMergeDraft(draft._id, false)}
//                       className="w-full text-sm bg-gray-800 text-white px-3 py-1.5 rounded hover:bg-gray-900"
//                     >
//                       Merge into Main
//                     </button>
//                   </div>
//                 ))}
//               </div>
//             </div>
//           )}

//           {/* No other drafts message */}
//           {otherDrafts && otherDrafts.length === 0 && allDrafts && allDrafts.length > 0 && (
//             <div className="text-center py-4 text-gray-500">
//               <div className="text-2xl mb-2">👥</div>
//               <p className="text-sm">No other drafts</p>
//             </div>
//           )}
//         </div>
//       )}

//       {/* Compare Modal */}
//       {compareDraftId && compareData && (
//         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
//           <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
//             <div className="flex justify-between items-center p-4 border-b">
//               <h3 className="font-semibold">Compare Draft</h3>
//               <button
//                 onClick={() => setCompareDraftId(null)}
//                 className="text-gray-500 hover:text-gray-700"
//               >
//                 ✕
//               </button>
//             </div>
            
//             <div className="grid grid-cols-2 h-[calc(80vh-120px)]">
//               <div className="border-r p-4 overflow-auto">
//                 <h4 className="font-medium text-gray-700 mb-2">Main Document</h4>
//                 <pre className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
//                   {compareData.mainContent}
//                 </pre>
//               </div>
//               <div className="p-4 overflow-auto">
//                 <h4 className="font-medium text-gray-700 mb-2">Draft Content</h4>
//                 <pre className="text-sm whitespace-pre-wrap bg-blue-50 p-3 rounded">
//                   {compareData.draftContent}
//                 </pre>
//               </div>
//             </div>
            
//             <div className="p-4 border-t">
//               <button
//                 onClick={() => {
//                   handleMergeDraft(compareDraftId, compareData.draftOwnerId === user?.id);
//                   setCompareDraftId(null);
//                 }}
//                 className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700"
//               >
//                 Merge This Draft
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }