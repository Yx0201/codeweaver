/**
 * Application-layer Chinese tokenizer backed by @node-rs/jieba (Rust/N-API).
 *
 * Replaces pgjieba so the same tokenization logic runs in Node.js at both
 * write time (building tsvector) and query time (building tsquery), and
 * persists tokens into PostgreSQL via the 'simple' text-search configuration,
 * which stores tokens verbatim without stemming.
 *
 * Stop-word filtering happens here in the app layer so:
 *   - tsvector indexes stay lean (no ubiquitous particles)
 *   - tsquery precision stays high (OR query on "的" would match every chunk)
 *   - Indexing and querying use the identical token set
 */
import { Jieba } from "@node-rs/jieba";

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let jieba: Jieba | null = null;

function getInstance(): Jieba {
  if (!jieba) {
    jieba = new Jieba();
  }
  return jieba;
}

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

/**
 * Common Chinese stop words that carry no retrieval value.
 *
 * Covers:
 *  - Structural particles: 的 地 得 了 着 过
 *  - Personal pronouns: 我 你 他 她 它 以及复数形式
 *  - Demonstratives: 这 那 此 其
 *  - Common auxiliaries: 是 有 没 不 都 就 会 能 可 被 让
 *  - Conjunctions / prepositions: 和 与 或 但 而 及 在 从 到 向 于 对 为 以
 *  - Common adverbs: 也 很 更 最 太 再 已 又 还 却 则 仍
 *  - Question words: 什么 怎么 怎样 为什么 哪 谁 何
 *  - High-frequency monosyllables with no semantic weight: 吧 呢 啊 哦 嗯
 */
const STOP_WORDS = new Set<string>([
  // Particles
  "的", "地", "得", "了", "着", "过",
  // Pronouns
  "我", "你", "他", "她", "它",
  "我们", "你们", "他们", "她们", "它们",
  "自己", "彼此",
  // Demonstratives
  "这", "那", "此", "其", "这个", "那个", "这些", "那些",
  // Copula / existential
  "是", "有", "没", "没有", "无",
  // Auxiliaries / modal
  "不", "都", "就", "会", "能", "可", "要", "该", "应", "被", "让", "使",
  "可以", "应该", "可能", "必须",
  // Conjunctions
  "和", "与", "或", "但", "而", "及", "以及", "还是",
  "虽然", "但是", "因为", "所以", "如果", "虽", "然而", "因此",
  // Prepositions
  "在", "从", "到", "向", "于", "对", "为", "以", "按", "把",
  // Adverbs
  "也", "很", "更", "最", "太", "再", "已", "又", "还", "却", "则", "仍",
  "非常", "十分", "极", "挺",
  // Question words
  "什么", "怎么", "怎样", "为什么", "哪", "谁", "何", "哪里", "哪个",
  // Filler / interjections
  "吧", "呢", "啊", "哦", "嗯", "嘛", "呀",
  // Common high-frequency single characters
  "一", "二", "三", "四", "五",
  "中", "上", "下", "内", "外",
  "个", "们", "的", "么",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Segment `text` into raw tokens (Jieba HMM mode), including stop words.
 * Most callers should prefer `tokenizeContent()`.
 */
export function tokenize(text: string): string[] {
  return getInstance()
    .cut(text, /* hmm= */ true)
    .filter((t: string) => t.trim().length > 0);
}

/**
 * Segment `text` and remove stop words.
 * This is the canonical function for both index building and query building —
 * using it for both sides ensures tsvector and tsquery are consistent.
 */
export function tokenizeContent(text: string): string[] {
  return tokenize(text).filter((t) => !STOP_WORDS.has(t));
}

/**
 * Tokenize, strip stop words, and join with spaces.
 * Pass the result to `to_tsvector('simple', $input)` — the 'simple'
 * configuration stores each space-separated token verbatim without stemming.
 */
export function toTsvectorInput(text: string): string {
  return tokenizeContent(text).join(" ");
}

/**
 * Build a PostgreSQL tsquery AND-string (all content tokens must match).
 * Each token gets the `:*` prefix-match suffix for prefix searching.
 * Returns `""` when no content tokens remain (caller should skip the clause).
 *
 * Example: "宗杭的父亲" → "宗杭:* & 父亲:*"
 * Use with: `to_tsquery('simple', $andQuery)` in SQL.
 */
export function buildAndTsquery(text: string): string {
  const tokens = tokenizeContent(text);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${t}:*`).join(" & ");
}

/**
 * Build a PostgreSQL tsquery OR-string (any content token must match).
 * Returns `""` when no content tokens remain.
 *
 * Example: "宗杭的父亲" → "宗杭:* | 父亲:*"
 * Use with: `to_tsquery('simple', $orQuery)` in SQL.
 */
export function buildOrTsquery(text: string): string {
  const tokens = tokenizeContent(text);
  if (tokens.length === 0) return "";
  return tokens.map((t) => `${t}:*`).join(" | ");
}
