import { useEffect } from "react";

/**
 * Per-route <title> / meta description, carrying over the exact strings the
 * static pages used. (No SSR here — this is a client-rendered SPA, so search
 * engines see the index.html defaults first; see README.)
 */
export default function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    if (!description) return;
    let tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "description";
      document.head.appendChild(tag);
    }
    tag.content = description;
  }, [title, description]);
}
