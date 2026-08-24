from sqlalchemy import Column, Integer, String, DateTime, JSON, Enum
from sqlalchemy.sql import func
from app.db.database import Base
import enum

class ProjectStatus(str, enum.Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    BUILDING = "building"
    FAILED = "failed"

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    repo_url = Column(String, nullable=False)
    branch = Column(String, nullable=False, default="main")
    replica = Column(Integer, nullable=False, default=1)
    env_vars = Column(JSON, nullable=False, default=dict)
    status = Column(Enum(ProjectStatus), nullable=False, default=ProjectStatus.BUILDING)
    container_ids = Column(JSON, nullable=True)  # liste des container IDs
    commit_hash = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())