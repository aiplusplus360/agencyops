import prisma from '../../lib/prisma.js';

/**
 * RAG / Knowledge Base service.
 * Stores extracted text from product documents and retrieves the most
 * relevant snippets by simple keyword overlap (a lightweight retrieval layer
 * that can be upgraded to vector embeddings later).
 */
export async function indexProductDocument(productId, { fileRef, extractedText }) {
  return prisma.productDocument.create({
    data: { productId, fileRef, extractedText },
  });
}

export async function retrieveContext(productId, query, { limit = 3 } = {}) {
  const docs = await prisma.productDocument.findMany({
    where: { productId },
    take: 20,
    orderBy: { uploadedAt: 'desc' },
  });
  if (!docs.length) return '';

  const q = query.toLowerCase();
  const scored = docs
    .map((d) => {
      const text = d.extractedText || '';
      let score = 0;
      for (const word of q.split(/\W+/).filter((w) => w.length > 3)) {
        if (text.toLowerCase().includes(word)) score++;
      }
      return { text, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored
    .slice(0, limit)
    .map((s) => s.text.slice(0, 1500))
    .join('\n---\n');
}

export async function extractTextFromFile(filePath, mimeType) {
  // Lightweight: return the filename reference. Full PDF/DOCX parsing
  // can be added later; TXT/JSON/CSV are read directly by controllers.
  return null;
}
