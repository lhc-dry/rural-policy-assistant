export type Role = "user" | "assistant";
export type Feedback = "useful" | "useless";
export interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
}
export interface KnowledgeDocument {
  id: string;
  categoryId: string;
  fileName: string;
  fileSize: number;
  uploadTime: string;
  mimeType: "application/pdf";
  processingStatus?: "processing" | "uploaded" | "failed";
  processingMessage?: string;
  /** Optional URL supplied by the API for administrator preview. */
  fileUrl?: string;
}
export interface Citation {
  documentId: string;
  documentName: string;
  documentVersion?: number;
  pageNumber: number;
  textSnippet: string;
  chunkId: string;
}
export interface Message {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
  feedback?: Feedback;
  status: "generating" | "success" | "failed" | "aborted";
  timestamp: string;
}
export interface Announcement {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  isPublished: boolean;
  categoryId?: string;
}
export interface Statistics {
  question: string;
  count: number;
  feedbackCount: number;
  uselessRate: number;
  coverage: number;
  hot: boolean;
}
export interface ChatRequest {
  conversationId: string;
  categoryId: string;
  question: string;
  documentIds?: string[];
  requestId: string;
}
export type SseEvent =
  | { type: "delta"; text: string }
  | { type: "done"; citations: Citation[]; messageId?: string; conversationId?: string }
  | { type: "error"; message: string };
