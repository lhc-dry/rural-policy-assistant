import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Message } from "../types";
interface AppState {
  selectedCategory: string;
  selectedDocs: Record<string, string[]>;
  messages: Record<string, Message[]>;
  setCategory: (id: string) => void;
  toggleDoc: (cat: string, id: string) => void;
  clear: (cat: string) => void;
  add: (cat: string, m: Message) => void;
  update: (cat: string, id: string, p: Partial<Message>) => void;
}
export const useApp = create<AppState>()(
  persist(
    (set) => ({
      selectedCategory: "subsidy",
      selectedDocs: {},
      messages: {},
      setCategory: (selectedCategory) => set({ selectedCategory }),
      toggleDoc: (cat, id) =>
        set((s) => {
          const a = s.selectedDocs[cat] || [];
          return {
            selectedDocs: {
              ...s.selectedDocs,
              [cat]: a.includes(id) ? a.filter((x) => x !== id) : [...a, id],
            },
          };
        }),
      clear: (cat) => set((s) => ({ messages: { ...s.messages, [cat]: [] } })),
      add: (cat, m) =>
        set((s) => ({
          messages: { ...s.messages, [cat]: [...(s.messages[cat] || []), m] },
        })),
      update: (cat, id, p) =>
        set((s) => ({
          messages: {
            ...s.messages,
            [cat]: (s.messages[cat] || []).map((m) =>
              m.id === id ? { ...m, ...p } : m,
            ),
          },
        })),
    }),
    {
      name: "rural-policy-state",
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => localStorage.setItem(name, value),
        removeItem: (name) => localStorage.removeItem(name),
      })),
      migrate: (value) => value as AppState,
      partialize: ({ selectedDocs, selectedCategory }) => ({
        selectedDocs,
        selectedCategory,
      }),
    },
  ),
);
