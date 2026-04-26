"""
RAG Recall Evaluation Script using ragas.

Evaluates the recall rate of the CodeWeaver RAG knowledge base system
by calling the Next.js API endpoints — the same endpoints the chat page
uses — ensuring the test reflects real user experience.

Pipeline: /api/vector-search (hybrid) → /api/system-prompt → /api/chat (eval mode)

Usage:
    pnpm run eval:recall
"""

import asyncio
import json
import os
import sys
import requests

from ragas import EvaluationDataset, evaluate
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.metrics import (
    LLMContextRecall,
    ContextPrecision,
    ResponseRelevancy,
    Faithfulness,
)
from langchain_ollama import OllamaEmbeddings
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
# Load .env.local from the project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env.local"))

# Next.js server URL — the script calls the same APIs the chat page uses
NEXTJS_BASE_URL = os.environ.get("NEXTJS_BASE_URL", "http://localhost:3000")

# Ollama embedding model for ragas metric evaluation (not for the RAG pipeline)
OLLAMA_BASE_URL = os.environ.get("LOCAL_OLLAMA_BASE_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.environ.get("LOCAL_EMBEDDING_MODEL", "bge-m3:latest")

# External LLM for ragas metric scoring (via Zenmux)
ZENMUX_API_KEY = os.environ.get("ZENMUX_API_KEY", "")
ZENMUX_BASE_URL = os.environ.get("ZENMUX_BASE_URL", "https://zenmux.ai/api/v1")
ZENMUX_MODEL_NAME = os.environ.get("ZENMUX_MODEL_NAME", "")

# Hybrid retrieval Top-K parameters
VECTOR_TOP_K = int(os.environ.get("VECTOR_TOP_K", "50"))
KEYWORD_TOP_K = int(os.environ.get("KEYWORD_TOP_K", "50"))
FINAL_TOP_K = int(os.environ.get("FINAL_TOP_K", "10"))

# ---------------------------------------------------------------------------
# Dataset loading
# ---------------------------------------------------------------------------
DATASETS_DIR = os.path.join(os.path.dirname(__file__), "datasets")

def load_dataset(dataset_name: str | None = None) -> list[dict]:
    """Load golden dataset from JSON file.

    If dataset_name is provided, loads datasets/<dataset_name>.json.
    Otherwise falls back to the default inline dataset.
    """
    if dataset_name:
        path = os.path.join(DATASETS_DIR, f"{dataset_name}.json")
        if not os.path.exists(path):
            print(f"ERROR: Dataset file not found: {path}")
            sys.exit(1)
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"Loaded dataset: {path} ({len(data)} questions)")
        return data

    # Default: use golden_v1.json if it exists, otherwise inline
    default_path = os.path.join(DATASETS_DIR, "golden_v1.json")
    if os.path.exists(default_path):
        with open(default_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"Loaded dataset: {default_path} ({len(data)} questions)")
        return data

    # Fallback inline dataset (original 8 questions)
    return _INLINE_DATASET


_INLINE_DATASET = [
    {
        "user_input": "易飒小时候在车里遇到危险时是怎么躲藏的？",
        "reference": "易飒拽过爸爸的一件黑色大棉袄，把自己整个儿罩住，然后安静地、蜷缩着、躺了下去，藏在车座下面。",
        "reference_contexts": [
            "囡囡咽了口唾沫，紧张地挪着屁股，慢慢下了车座。她动作很轻地拽过边上爸爸的一件黑色大棉袄，把自己整个儿罩住，然后安静地、蜷缩着、躺了下去。",
        ],
    },
    {
        "user_input": "宗杭的父亲叫什么名字？他是做什么的？",
        "reference": "宗杭的父亲叫宗必胜，是个小老板，在柬埔寨暹粒与人合资开了吴哥大酒店。",
        "reference_contexts": [
            "他爹宗必胜看到他发的那条朋友圈，会是什么反应。",
            "宗必胜在家吃香喝辣的，这叔……这大包小包的架势，出国打工的吧。",
        ],
    },
    {
        "user_input": "宗杭为什么被送到柬埔寨暹粒？",
        "reference": "宗杭嫌打工太累，自作主张辞了工作，向父亲宗必胜提出能不能在家里公司找个轻松的活。宗必胜很生气，让他去暹粒的酒店当实习生（TRAINEE），算是变相流放。",
        "reference_contexts": [
            "宗必胜做人真绝，两天后通知他，让他去暹粒的酒店帮忙，职位叫TRAINEE（实习生）。",
            "不过是他嫌打工太累，自作主张辞了工作，然后委婉地向宗必胜提说能不能在家里的公司给他找个钱多事少的活。",
        ],
    },
    {
        "user_input": "龙宋是谁？他和宗杭是什么关系？",
        "reference": "龙宋是宗杭在柬埔寨的门拖（mentor，导师），负责在当地照顾和指导宗杭。他是吴哥大酒店的负责人，也是宗必胜信任的合伙人。",
        "reference_contexts": [
            "这就是他的门拖，龙宋。",
            "龙宋让他妥了之后就朝机场出口走，说是有人在那接，接机牌非常显眼，绝对不会错过。",
        ],
    },
    {
        "user_input": "宗杭在暹粒老市场第一次被打是怎么回事？",
        "reference": "马老头（马跃飞）在老市场被两个柬埔寨人追赶时，把宗杭当作儿子喊，让他去报警。宗杭被误认为是马老头的同伙，逃跑时不小心用废料板材砸伤了一个追赶者，之后被两个柬埔寨人暴打。",
        "reference_contexts": [
            "马老头突然朝那人扑了过去。他拼尽所有力气，死死抱住那人的腿，转头朝着宗杭离开的方向声嘶力竭大叫：\u201c儿子！快跑！快去报警！\u201d",
            "宗杭叫苦不迭，别看他人高腿长，但素来没锻炼底子，眼见就要被人撵上",
        ],
    },
    {
        "user_input": "易飒的突突车酒吧是怎么经营的？",
        "reference": "易飒在老市场区有一辆突突车酒吧，但她不亲自管理，而是包租给别人，按月收租金。她的包租业务遍布湄公河流域多个国家。",
        "reference_contexts": [
            "突突车酒吧确实是她的，但她不管，包租给别人，按月收租金。听人说，她不但包租突突车，还包租了条小游船",
            "据说，溯着湄公河而上至老挝，而下至越南，遍布她的包租业务",
        ],
    },
    {
        "user_input": "什么是水鬼三姓？他们分别沿哪条河居住？",
        "reference": "水鬼三姓指的是丁、姜、易三个姓氏的家族。丁姓沿黄河而居，姜姓住在长江流域，易姓沿澜沧江-湄公河而下。他们拥有在水下存活的天赋。",
        "reference_contexts": [
            "他们自然而然，以河为分，丁姓沿黄河而居，姜姓住地不离长江流域，易姓也一样，顺着\u2018澜沧江-湄公河\u2019而下，有水的地方，就有他们。",
        ],
    },
    {
        "user_input": "水鬼三姓的主业是什么？",
        "reference": "水鬼三姓的主业是帮人在水下藏东西（托管），每一单都价值巨大。存期少则几十年，长可几百年。他们收取三成的费用，到期不来则加到五成，十年再不来则全部归三姓所有。",
        "reference_contexts": [
            "主业是帮人在水下藏东西，或者叫托管，每一单都价值巨大，毕竟如果只是一两箱金银，也不值得费这个事。存期少则几十年，长可几百年，随客户的心意。",
            "我们只收钱，不付钱！管你金山银山，想托我管，分出三成。",
        ],
    },
]


# ---------------------------------------------------------------------------
# RAG Pipeline — calls the Next.js API endpoints
# (identical to what the chat page uses)
# ---------------------------------------------------------------------------

def hybrid_search(query: str, knowledge_base_id: int) -> list[dict]:
    """Call the Next.js hybrid search API (vector + keyword + RRF)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/vector-search",
        json={
            "query": query,
            "knowledgeBaseId": knowledge_base_id,
            "vectorTopK": VECTOR_TOP_K,
            "keywordTopK": KEYWORD_TOP_K,
            "finalTopK": FINAL_TOP_K,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["results"]


def build_system_prompt(contexts: list[str]) -> str:
    """Call the Next.js system prompt API (same as chat page)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/system-prompt",
        json={"contexts": contexts},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["systemPrompt"]


def generate_answer(query: str, system_prompt: str) -> str:
    """Call the Next.js chat API in eval mode (same model, same prompt)."""
    resp = requests.post(
        f"{NEXTJS_BASE_URL}/api/chat",
        json={
            "messages": [{"role": "user", "content": query}],
            "systemPrompt": system_prompt,
            "mode": "eval",
            "vectorTopK": VECTOR_TOP_K,
            "keywordTopK": KEYWORD_TOP_K,
            "finalTopK": FINAL_TOP_K,
        },
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json()["answer"]


# ---------------------------------------------------------------------------
# Resolve knowledge base ID
# ---------------------------------------------------------------------------

def resolve_knowledge_base_id() -> int:
    """Find the knowledge base via direct DB query."""
    import psycopg2

    DB_HOST = os.environ.get("DB_HOST", "localhost")
    DB_PORT = os.environ.get("DB_PORT", "5432")
    DB_NAME = os.environ.get("DB_NAME", "knowledge_db")
    DB_USER = os.environ.get("DB_USER", "bbimasheep")
    DB_PASSWORD = os.environ.get("DB_PASSWORD", "")

    conn = psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM knowledge_base ORDER BY id LIMIT 1")
            row = cur.fetchone()
            if row:
                print(f"Using knowledge base: id={row[0]}, name={row[1]}")
                return row[0]
            print("ERROR: No knowledge base found.")
            sys.exit(1)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Main evaluation
# ---------------------------------------------------------------------------

async def run_evaluation():
    # Support --dataset argument
    dataset_name = None
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--dataset" and i + 1 < len(sys.argv[1:]):
            dataset_name = sys.argv[i + 2]
            break

    golden_dataset = load_dataset(dataset_name)

    print("=" * 60)
    print("  RAG Recall Evaluation (ragas) — Hybrid Retrieval")
    print("=" * 60)
    print(f"Next.js URL:     {NEXTJS_BASE_URL}")
    print(f"Scoring LLM:     {ZENMUX_MODEL_NAME} (via Zenmux, base={ZENMUX_BASE_URL})")
    print(f"Eval Embeddings: {EMBEDDING_MODEL} (local Ollama)")
    print(f"Hybrid Top-K:    vector={VECTOR_TOP_K}, keyword={KEYWORD_TOP_K}, final={FINAL_TOP_K}")
    print(f"Golden Dataset:  {len(golden_dataset)} questions")
    print("=" * 60)

    # 1. Resolve knowledge base ID
    kb_id = resolve_knowledge_base_id()

    # 2. Run the RAG pipeline for each question
    print("\n[1/3] Running RAG pipeline to collect responses...")
    sample_list = []
    for i, item in enumerate(golden_dataset):
        question = item["user_input"]
        print(f"  [{i+1}/{len(golden_dataset)}] {question}")

        # Step 1: Hybrid search (vector + keyword + RRF)
        search_results = hybrid_search(question, kb_id)
        retrieved_contexts = [r["chunk_text"] for r in search_results]

        # Step 2: Build system prompt (same as chat page)
        system_prompt = ""
        if retrieved_contexts:
            system_prompt = build_system_prompt(retrieved_contexts)

        # Step 3: Generate answer via chat API (same model, same prompt)
        answer = generate_answer(question, system_prompt) if system_prompt else "无法检索到相关上下文。"

        sample_list.append({
            "user_input": question,
            "response": answer,
            "reference": item["reference"],
            "reference_contexts": item["reference_contexts"],
            "retrieved_contexts": retrieved_contexts,
        })

    # 3. Build ragas EvaluationDataset
    print("\n[2/3] Building ragas EvaluationDataset...")
    eval_samples = []
    for s in sample_list:
        eval_samples.append({
            "user_input": s["user_input"],
            "response": s["response"],
            "reference": s["reference"],
            "reference_contexts": s["reference_contexts"],
            "retrieved_contexts": s["retrieved_contexts"],
        })

    dataset = EvaluationDataset.from_list(eval_samples)

    # 4. Configure ragas: external LLM for scoring, local Ollama for embeddings
    print("[3/3] Running ragas evaluation (this may take a while)...\n")

    if not ZENMUX_API_KEY or not ZENMUX_MODEL_NAME:
        print("ERROR: ZENMUX_API_KEY, ZENMUX_BASE_URL, ZENMUX_MODEL_NAME must be set in .env.local")
        sys.exit(1)

    scoring_llm = ChatOpenAI(
        model=ZENMUX_MODEL_NAME,
        api_key=ZENMUX_API_KEY,
        base_url=ZENMUX_BASE_URL,
        temperature=0,
    )
    embeddings = OllamaEmbeddings(
        model=EMBEDDING_MODEL,
        base_url=OLLAMA_BASE_URL,
    )

    ragas_llm = LangchainLLMWrapper(scoring_llm)
    ragas_embeddings = LangchainEmbeddingsWrapper(embeddings)

    metrics = [
        LLMContextRecall(llm=ragas_llm),
        ContextPrecision(llm=ragas_llm),
        ResponseRelevancy(llm=ragas_llm, embeddings=ragas_embeddings),
        Faithfulness(llm=ragas_llm),
    ]

    result = evaluate(
        dataset=dataset,
        metrics=metrics,
    )

    # 5. Print results
    print("\n" + "=" * 60)
    print("  Evaluation Results")
    print("=" * 60)

    print(result.to_pandas().to_string(index=False))

    print("\n--- Metric Averages ---")
    df = result.to_pandas()
    for col in df.columns:
        if col not in ("user_input", "response", "reference",
                        "reference_contexts", "retrieved_contexts"):
            try:
                avg = df[col].astype(float).mean()
                print(f"  {col}: {avg:.4f}")
            except (ValueError, TypeError):
                pass

    # Save results to JSON
    output_path = os.path.join(os.path.dirname(__file__), "eval_results.json")
    results_data = []
    for s in sample_list:
        results_data.append({
            "question": s["user_input"],
            "ground_truth": s["reference"],
            "rag_answer": s["response"],
            "retrieved_contexts": s["retrieved_contexts"],
            "reference_contexts": s["reference_contexts"],
        })

    metric_averages = {}
    for col in df.columns:
        if col not in ("user_input", "response", "reference",
                        "reference_contexts", "retrieved_contexts"):
            try:
                metric_averages[col] = round(float(df[col].astype(float).mean()), 4)
            except (ValueError, TypeError):
                pass

    output = {
        "metric_averages": metric_averages,
        "details": results_data,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    asyncio.run(run_evaluation())
