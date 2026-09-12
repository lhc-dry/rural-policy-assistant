import { create } from "zustand";
import type { Announcement, Category, KnowledgeDocument } from "../types";
import { api } from "../api/http";
interface Data {
  categories: Category[];
  documents: KnowledgeDocument[];
  announcements: Announcement[];
  error: string;
  reload: () => Promise<void>;
}
export const useData = create<Data>((set) => ({
  categories: [],
  documents: [],
  announcements: [],
  error: "",
  async reload() {
    try {
      const admin = location.pathname.startsWith("/admin");
      const [c, d, a] = await Promise.all([
        api.get<Category[]>("/categories"),
        api.get<KnowledgeDocument[] | { items: KnowledgeDocument[] }>(admin ? "/admin/documents" : "/visitor/documents"),
        api.get<Announcement[]>(admin ? "/admin/announcements" : "/visitor/announcements"),
      ]);
      set({
        categories: c.data.sort((a, b) => {
          const order = [
            "subsidy",
            "ecommerce",
            "disaster",
            "legal",
            "planting",
          ];
          const index = (id: string) =>
            order.includes(id) ? order.indexOf(id) : 99;
          return index(a.id) - index(b.id);
        }),
        documents: (Array.isArray(d.data) ? d.data : d.data.items).filter(
          (doc) =>
            doc.mimeType === "application/pdf" &&
            (admin || doc.processingStatus === undefined),
        ),
        announcements: a.data,
        error: "",
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "数据加载失败" });
    }
  },
}));
