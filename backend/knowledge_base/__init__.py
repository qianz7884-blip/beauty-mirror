"""
知识库模块 — 基于 ChromaDB 的皮肤科 RAG 系统

提供：
- ChromaDB 向量存储初始化
- 种子数据自动入库
- 基于上下文的皮肤科知识检索
"""

from .vector_store import (
    init_knowledge_base,
    query_knowledge,
    get_kb_stats,
)
