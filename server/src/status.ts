export type DocumentProcessingStatus = "processing" | "uploaded" | "failed";
export function toProcessingStatus(status: string): DocumentProcessingStatus {
  return status === "ready" ? "uploaded" : status === "failed" ? "failed" : "processing";
}
export function statusMessage(status: string, processingError?: string | null) {
  if (status === "ready") return "文件解析完毕，可以用于问答";
  if (status === "failed") {
    if (processingError?.includes("未检测到可提取文本")) return "未检测到可提取文字，请上传可复制文字的 PDF";
    if (processingError?.includes("ENOENT") || processingError?.includes("no such file")) return "原文件不存在，请重新上传 PDF";
    return "文件解析出错，请检查 PDF 后重新处理";
  }
  return "文件已接收，后台正在解析生成知识库";
}
