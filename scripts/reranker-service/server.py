"""
Lightweight Reranker API Server.

Runs bge-reranker-v2-m3 locally on Apple Silicon (MPS/CPU),
exposing a Jina-compatible /rerank endpoint.

Usage:
    cd scripts/reranker-service
    source .venv/bin/activate
    python server.py

The server will be available at http://localhost:8081
"""

import os
import time
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# Lazy-loaded model
_model = None


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import CrossEncoder
        model_name = os.environ.get("RERANKER_MODEL", "BAAI/bge-reranker-v2-m3")
        device = os.environ.get("DEVICE", "cpu")
        print(f"Loading {model_name} on {device}...")
        start = time.time()
        _model = CrossEncoder(model_name, device=device)
        print(f"Model loaded in {time.time() - start:.1f}s")
    return _model


class RerankRequest(BaseModel):
    query: str
    documents: list[str]
    top_n: int | None = None
    model: str | None = None


class RerankResult(BaseModel):
    index: int
    relevance_score: float


class RerankResponse(BaseModel):
    results: list[RerankResult]


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/rerank", response_model=RerankResponse)
async def rerank(req: RerankRequest):
    model = get_model()

    # CrossEncoder.rank returns sorted results
    results = model.rank(req.query, req.documents, return_documents=False)

    top_n = req.top_n or len(results)
    rerank_results = [
        RerankResult(
            index=r["corpus_id"],
            relevance_score=r["score"],
        )
        for r in results[:top_n]
    ]

    return RerankResponse(results=rerank_results)


if __name__ == "__main__":
    import uvicorn

    # Pre-load model at startup
    get_model()

    port = int(os.environ.get("PORT", "8081"))
    uvicorn.run(app, host="0.0.0.0", port=port)
