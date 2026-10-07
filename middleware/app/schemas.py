from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class TodoBase(BaseModel):
    title: str
    description: Optional[str] = ""

class TodoCreate(TodoBase):
    pass

class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    completed: Optional[bool] = None

class TodoOut(TodoBase):
    id: int
    completed: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

