// Short English stop-word list for note tokenization.
// Intentionally conservative — aggressive filtering hurts similarity recall on
// notes that are already ≤ 30 words. Contractions expand-and-split in the
// tokenizer so "don't" → "dont" isn't captured separately.
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'if', 'while', 'as', 'because', 'so', 'than', 'too', 'very', 'just', 'also', 'only',
  'with', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'to', 'up', 'down', 'over', 'under',
  'about', 'against', 'between', 'through', 'during', 'before', 'after', 'above', 'below',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'his', 'her', 'its', 'my', 'your', 'our',
  'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'can', 'could', 'will', 'would', 'should', 'may', 'might', 'must', 'shall',
  'not', 'no', 'yes',
  'any', 'all', 'some', 'out', 'there', 'here', 'then', 'now', 'again',
  's', 't',
]);
