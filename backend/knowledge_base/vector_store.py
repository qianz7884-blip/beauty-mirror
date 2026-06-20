"""
ChromaDB 向量存储 — 皮肤科知识库的 RAG 后端

使用 ChromaDB（嵌入式）存储皮肤科知识，通过 Gemini Embedding 进行语义检索。
"""

import os
import json
import traceback

# ChromaDB 持久化目录
CHROMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chroma_data')

_collection = None  # 单例缓存


def _get_embedding(text):
    """
    使用 Google Gemini text-embedding-004 生成文本向量。

    返回:
        list[float]: 768 维向量
    """
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise RuntimeError('未设置 GEMINI_API_KEY，无法生成 embedding')

    from google import genai
    client = genai.Client(api_key=api_key)

    result = client.models.embed_content(
        model='text-embedding-004',
        contents=text,
    )
    return result.embeddings[0].values


def _get_collection():
    """
    懒加载 ChromaDB collection。
    首次调用时自动初始化并检查是否需要种子数据入库。
    """
    global _collection
    if _collection is not None:
        return _collection

    try:
        import chromadb
    except ImportError:
        raise ImportError(
            '未安装 chromadb，请执行: pip install chromadb'
        )

    os.makedirs(CHROMA_PATH, exist_ok=True)

    client = chromadb.PersistentClient(path=CHROMA_PATH)

    # 获取或创建 collection
    try:
        _collection = client.get_collection('skin_knowledge')
        print(f'[knowledge_base] 已加载现有 collection (count={_collection.count()})')
    except Exception:
        _collection = client.create_collection(
            name='skin_knowledge',
            metadata={'description': '皮肤科专业知识库'},
        )
        print('[knowledge_base] 已创建新 collection')

    return _collection


def init_knowledge_base():
    """
    初始化知识库：如果 collection 为空，自动导入种子数据。
    应在应用启动时调用一次。
    """
    try:
        collection = _get_collection()

        # 已初始化则跳过
        if collection.count() > 0:
            print(f'[knowledge_base] 知识库已就绪 ({collection.count()} 条记录)')
            return True

        # 加载种子数据
        seed_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            'skin_knowledge.json',
        )
        if not os.path.exists(seed_path):
            print('[knowledge_base] 种子数据文件不存在，跳过初始化')
            return False

        with open(seed_path, 'r', encoding='utf-8') as f:
            documents = json.load(f)

        print(f'[knowledge_base] 开始导入 {len(documents)} 条种子数据...')

        ids = []
        embeddings = []
        metadatas = []
        documents_list = []

        for doc in documents:
            doc_id = doc.get('id', '')
            topic = doc.get('topic', '')
            category = doc.get('category', '')
            content = doc.get('content', '')

            # 组合 topic + content 生成 embedding
            text_to_embed = f'{topic}\n{content}'

            try:
                embedding = _get_embedding(text_to_embed)
            except Exception as e:
                print(f'[knowledge_base] embedding 生成失败 ({doc_id}): {e}')
                continue

            ids.append(doc_id)
            embeddings.append(embedding)
            metadatas.append({
                'category': category,
                'topic': topic,
            })
            documents_list.append(content)

        if ids:
            collection.add(
                ids=ids,
                embeddings=embeddings,
                metadatas=metadatas,
                documents=documents_list,
            )
            print(f'[knowledge_base] 种子数据导入完成: {len(ids)} 条')
        else:
            print('[knowledge_base] 无有效数据可导入')

        return True

    except Exception as e:
        print(f'[knowledge_base] 初始化失败: {e}')
        traceback.print_exc()
        return False


def query_knowledge(query_text, top_k=3):
    """
    语义检索相关知识。

    参数:
        query_text: 查询文本（如 "混合性肌肤 T区出油 毛孔粗大"）
        top_k: 返回条数

    返回:
        list[dict]: 检索结果 [{topic, content, category, distance}, ...]
    """
    try:
        collection = _get_collection()

        if collection.count() == 0:
            print('[knowledge_base] 知识库为空，跳过检索')
            return []

        query_embedding = _get_embedding(query_text)

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
        )

        items = []
        if results['ids'] and results['ids'][0]:
            for i, doc_id in enumerate(results['ids'][0]):
                items.append({
                    'id': doc_id,
                    'topic': results['metadatas'][0][i].get('topic', '') if results['metadatas'][0] else '',
                    'category': results['metadatas'][0][i].get('category', '') if results['metadatas'][0] else '',
                    'content': results['documents'][0][i] if results['documents'][0] else '',
                    'distance': results['distances'][0][i] if results['distances'] and results['distances'][0] else None,
                })

        print(f'[knowledge_base] 检索完成: query="{query_text[:50]}..." → {len(items)} 条结果')
        return items

    except Exception as e:
        print(f'[knowledge_base] 检索失败: {e}')
        traceback.print_exc()
        return []


def get_kb_stats():
    """获取知识库统计信息"""
    try:
        collection = _get_collection()
        return {
            'count': collection.count(),
            'path': CHROMA_PATH,
        }
    except Exception:
        return {'count': 0, 'path': CHROMA_PATH}
