declare module "pdf-parse" {
  interface PdfResult { text: string; numpages?: number }
  const parse: (data: Buffer, options?: { pagerender?: (page: unknown) => Promise<string> }) => Promise<PdfResult>;
  export default parse;
}
