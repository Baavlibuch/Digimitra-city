"""
Vector service for Milvus integration
OOP-oriented vector database operations
"""
import os
import numpy as np
import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pymilvus import (
    connections, FieldSchema, CollectionSchema, DataType, Collection,
    utility, MilvusException
)

class MilvusVectorService:
    """OOP service for Milvus vector database operations"""
    
    def __init__(self,
                 host: str = None,
                 port: str = None,
                 collection_name: str = "surveillance_embeddings"):
        
        self.host = host or os.environ.get("MILVUS_HOST", "localhost")
        self.port = port or os.environ.get("MILVUS_PORT", "19530")
        self.collection_name = collection_name
        self.logger = logging.getLogger("MilvusVectorService")
        
        # Collection configuration
        self.embedding_dim = 512  # X-CLIP embedding dimension
        self.index_type = "IVF_FLAT"
        self.metric_type = "IP"
        self.nlist = 1024
        
        self.collection = None
        self.connection_alias = "default"
        
        self._initialize_connection()
        self._initialize_collection()
    
    def _initialize_connection(self) -> bool:
        """Initialize connection to Milvus"""
        try:
            connections.connect(
                alias=self.connection_alias,
                host=self.host,
                port=self.port
            )
            
            self.logger.info(f"Connected to Milvus: {self.host}:{self.port}")
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to connect to Milvus: {e}")
            return False
    
    def _initialize_collection(self) -> bool:
        """Initialize or create Milvus collection"""
        try:
            # Check if collection exists
            if utility.has_collection(self.collection_name):
                self.collection = Collection(self.collection_name)
                self.logger.info(f"Using existing collection: {self.collection_name}")
            else:
                self._create_collection()
            
            # Load collection
            if self.collection:
                if not self.collection.has_index():
                     self.logger.info("Index missing, creating...")
                     self._create_index()
                self.collection.load()
                self.logger.info(f"Collection loaded: {self.collection_name}")
                return True
            
            return False
            
        except Exception as e:
            self.logger.error(f"Error initializing collection: {e}")
            return False
    
    def _create_collection(self):
        """Create new Milvus collection with schema"""
        try:
            # Define schema fields
            fields = [
                FieldSchema(
                    name="id",
                    dtype=DataType.VARCHAR,
                    is_primary=True,
                    max_length=64,
                    description="Unique identifier for embedding"
                ),
                FieldSchema(
                    name="event_id",
                    dtype=DataType.VARCHAR,
                    max_length=64,
                    description="Event ID from PostgreSQL"
                ),
                FieldSchema(
                    name="camera_id",
                    dtype=DataType.VARCHAR,
                    max_length=64,
                    description="Camera identifier"
                ),
                FieldSchema(
                    name="timestamp",
                    dtype=DataType.INT64,
                    description="Unix timestamp"
                ),
                FieldSchema(
                    name="event_type",
                    dtype=DataType.VARCHAR,
                    max_length=50,
                    description="Type of detected event"
                ),
                FieldSchema(
                    name="confidence",
                    dtype=DataType.FLOAT,
                    description="Detection confidence score"
                ),
                FieldSchema(
                    name="embedding",
                    dtype=DataType.FLOAT_VECTOR,
                    dim=self.embedding_dim,
                    description="X-CLIP embedding vector"
                )
            ]
            
            # Create schema
            schema = CollectionSchema(
                fields=fields,
                description="Surveillance event embeddings collection"
            )
            
            # Create collection
            self.collection = Collection(
                name=self.collection_name,
                schema=schema
            )
            
            self._create_index()
            
            self.logger.info(f"Created collection: {self.collection_name}")
            
        except Exception as e:
            self.logger.error(f"Error creating collection: {e}")
            raise

    def _create_index(self):
        # Create index
        index_params = {
            "index_type": self.index_type,
            "metric_type": self.metric_type,
            "params": {"nlist": self.nlist}
        }
        
        self.collection.create_index(
            field_name="embedding",
            index_params=index_params
        )
    
    def insert_embedding(self,
                        embedding_id: str,
                        event_id: str,
                        camera_id: str,
                        timestamp: datetime,
                        event_type: str,
                        confidence: float,
                        embedding: np.ndarray) -> bool:
        """Insert single embedding into Milvus"""
        
        if not self.collection:
            self.logger.error("Collection not initialized")
            return False
        
        try:
            # Prepare data
            data = [
                [embedding_id],  # id
                [event_id],      # event_id
                [camera_id],     # camera_id
                [int(timestamp.timestamp())],  # timestamp
                [event_type],    # event_type
                [confidence],    # confidence
                [embedding.tolist()]  # embedding
            ]
            
            # Insert data
            insert_result = self.collection.insert(data)
            
            # Flush to ensure data is written
            self.collection.flush()
            
            self.logger.info(f"Inserted embedding: {embedding_id}")
            return True
            
        except MilvusException as e:
            self.logger.error(f"Milvus error inserting embedding: {e}")
            return False
        except Exception as e:
            self.logger.error(f"Error inserting embedding: {e}")
            return False
    
    def batch_insert_embeddings(self,
                               embeddings_data: List[Dict[str, Any]]) -> bool:
        """Insert multiple embeddings in batch"""
        
        if not self.collection or not embeddings_data:
            return False
        
        try:
            # Prepare batch data
            ids = []
            event_ids = []
            camera_ids = []
            timestamps = []
            event_types = []
            confidences = []
            embeddings = []
            
            for data in embeddings_data:
                ids.append(data["embedding_id"])
                event_ids.append(data["event_id"])
                camera_ids.append(data["camera_id"])
                timestamps.append(int(data["timestamp"].timestamp()))
                event_types.append(data["event_type"])
                confidences.append(data["confidence"])
                embeddings.append(data["embedding"].tolist())
            
            batch_data = [
                ids, event_ids, camera_ids, timestamps,
                event_types, confidences, embeddings
            ]
            
            # Insert batch
            insert_result = self.collection.insert(batch_data)
            self.collection.flush()
            
            self.logger.info(f"Batch inserted {len(embeddings_data)} embeddings")
            return True
            
        except Exception as e:
            self.logger.error(f"Error batch inserting embeddings: {e}")
            return False
    
    def search_similar(self,
                      query_embedding: np.ndarray,
                      top_k: int = 10,
                      camera_filter: str = None,
                      event_type_filter: str = None,
                      time_range: Tuple[datetime, datetime] = None) -> List[Dict[str, Any]]:
        """Search for similar embeddings"""
        
        if not self.collection:
            return []
        
        try:
            # Build search expression (filters)
            expressions = []
            
            if camera_filter:
                expressions.append(f'camera_id == "{camera_filter}"')
            
            if event_type_filter:
                expressions.append(f'event_type == "{event_type_filter}"')
            
            if time_range:
                start_ts = int(time_range[0].timestamp())
                end_ts = int(time_range[1].timestamp())
                expressions.append(f'timestamp >= {start_ts} and timestamp <= {end_ts}')
            
            expr = " and ".join(expressions) if expressions else None
            
            # Search parameters
            search_params = {
                "metric_type": self.metric_type,
                "params": {"nprobe": 10}
            }
            
            # Perform search
            results = self.collection.search(
                data=[query_embedding.tolist()],
                anns_field="embedding",
                param=search_params,
                limit=top_k,
                expr=expr,
                output_fields=["event_id", "camera_id", "timestamp", "event_type", "confidence"]
            )
            
            # Process results
            search_results = []
            for hits in results:
                for hit in hits:
                    result = {
                        "embedding_id": hit.id,
                        "distance": hit.distance,
                        "similarity": 1 - hit.distance,  # Convert distance to similarity
                        **hit.entity.fields
                    }
                    
                    # Convert timestamp back to datetime
                    result["timestamp"] = datetime.fromtimestamp(result["timestamp"])
                    
                    search_results.append(result)
            
            return search_results
            
        except Exception as e:
            self.logger.error(f"Error searching embeddings: {e}")
            return []
    
    def delete_embeddings(self, embedding_ids: List[str]) -> bool:
        """Delete embeddings by IDs"""
        
        if not self.collection or not embedding_ids:
            return False
        
        try:
            # Build expression for deletion
            ids_str = '", "'.join(embedding_ids)
            expr = f'id in ["{ids_str}"]'
            
            # Delete embeddings
            self.collection.delete(expr)
            self.collection.flush()
            
            self.logger.info(f"Deleted {len(embedding_ids)} embeddings")
            return True
            
        except Exception as e:
            self.logger.error(f"Error deleting embeddings: {e}")
            return False
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """Get collection statistics"""
        
        if not self.collection:
            return {}
        
        try:
            stats = self.collection.get_compaction_state()
            num_entities = self.collection.num_entities
            
            return {
                "collection_name": self.collection_name,
                "num_entities": num_entities,
                "embedding_dim": self.embedding_dim,
                "index_type": self.index_type,
                "metric_type": self.metric_type
            }
            
        except Exception as e:
            self.logger.error(f"Error getting collection stats: {e}")
            return {}
    
    def health_check(self) -> bool:
        """Check Milvus service health"""
        
        try:
            # Check connection
            if not connections.has_connection(self.connection_alias):
                return False
            
            # Check collection
            if not self.collection:
                return False
            
            # Try a simple operation
            stats = self.collection.num_entities
            return True
            
        except Exception as e:
            self.logger.error(f"Milvus health check failed: {e}")
            return False
    
    def __del__(self):
        """Cleanup on destruction"""
        try:
            if connections.has_connection(self.connection_alias):
                connections.disconnect(self.connection_alias)
        except:
            pass